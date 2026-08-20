"""Phase 2 (best-sellers, manual-sale) + Phase 4 (order P&L) tests."""
import os
import math
import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@printandsave.ca", "password": "admin123"}
NONADMIN = {"email": "cliente1@test.com", "password": "test123"}


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="session")
def nonadmin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=NONADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"non-admin account unavailable ({r.status_code})")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="session")
def seed(admin):
    """Create material (sheet), ink material + machine, published product with BoM."""
    created = {"materials": [], "products": [], "orders": [], "machines": []}

    m = admin.post(f"{API}/materials", json={
        "name": "TEST_Vinyl_P24", "category": "sheet", "unit": "sheet",
        "unit_cost": 2.5, "stock_qty": 500}, timeout=30)
    assert m.status_code == 200, m.text[:300]
    mat_id = m.json()["id"]
    created["materials"].append(mat_id)

    mach = admin.post(f"{API}/machines", json={
        "name": "TEST_Printer_P24", "category": "largeformat", "purchase_price": 0,
        "ink_ml_per_sqft_full": 10.0}, timeout=30)
    assert mach.status_code == 200, mach.text[:300]
    machine_id = mach.json()["id"]
    created["machines"].append(machine_id)

    ink = admin.post(f"{API}/materials", json={
        "name": "TEST_Ink_Cyan_P24", "category": "ink", "unit": "each",
        "unit_cost": 100.0, "ink_volume_ml": 1000.0, "stock_qty": 5,
        "machine_id": machine_id}, timeout=30)
    assert ink.status_code == 200, ink.text[:300]
    created["materials"].append(ink.json()["id"])

    p = admin.post(f"{API}/catalog-products", json={
        "name": "TEST_BoM_Product_P24", "category": "Signs", "published": True,
        "retail_markup_pct": 200,
        "bom": [{"material_id": mat_id, "material_name": "TEST_Vinyl_P24",
                 "qty_per_unit": 2.0, "waste_per_order": 0, "waste_per_unit": 0}]},
        timeout=30)
    assert p.status_code == 200, p.text[:300]
    prod = p.json()
    created["products"].append(prod["id"])

    p2 = admin.post(f"{API}/catalog-products", json={
        "name": "TEST_NoBoM_Product_P24", "category": "Signs", "published": True,
        "price": 40.0}, timeout=30)
    assert p2.status_code == 200
    created["products"].append(p2.json()["id"])

    yield {"material_id": mat_id, "machine_id": machine_id,
           "product": prod, "product_nobom": p2.json(), "created": created}

    # cleanup
    for oid in created["orders"]:
        admin.delete(f"{API}/orders/{oid}", timeout=30)
    for pid in created["products"]:
        admin.delete(f"{API}/catalog-products/{pid}", timeout=30)
    for mid in created["materials"]:
        admin.delete(f"{API}/materials/{mid}", timeout=30)
    for mid in created["machines"]:
        admin.delete(f"{API}/machines/{mid}", timeout=30)


# ---------------- RBAC ----------------
class TestRBAC:
    def test_best_sellers_requires_auth(self):
        r = requests.get(f"{API}/finance/best-sellers", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_best_sellers_non_admin_403(self, nonadmin):
        r = nonadmin.get(f"{API}/finance/best-sellers", timeout=30)
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_manual_sale_non_admin_403(self, nonadmin):
        r = nonadmin.post(f"{API}/finance/manual-sale",
                          json={"items": [{"name": "x", "qty": 1, "unit_price": 1}]}, timeout=30)
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_pnl_non_admin_403(self, nonadmin, seed, admin):
        r0 = admin.post(f"{API}/orders", json={"items": [{"product_id": seed["product"]["id"], "qty": 1}]}, timeout=60)
        assert r0.status_code == 200, r0.text[:300]
        oid = r0.json()["id"]
        seed["created"]["orders"].append(oid)
        r = nonadmin.get(f"{API}/orders/{oid}/pnl", timeout=30)
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"


# ---------------- Phase 2: best-sellers ----------------
class TestBestSellers:
    def test_shape_and_periods(self, admin):
        for period in ["day", "week", "month", "year"]:
            r = admin.get(f"{API}/finance/best-sellers", params={"period": period}, timeout=60)
            assert r.status_code == 200, f"{period}: {r.status_code} {r.text[:300]}"
            d = r.json()
            for k in ["period", "monthly_goal", "total_units", "total_revenue",
                      "total_profit", "by_units", "by_profit"]:
                assert k in d, f"{period} missing {k}"
            assert d["period"] == period
            assert isinstance(d["by_units"], list) and isinstance(d["by_profit"], list)
            for row in d["by_units"]:
                for k in ["name", "units", "revenue", "unit_cost", "cost_known", "profit",
                          "unit_profit", "times_to_goal", "image_url", "share_text"]:
                    assert k in row, f"{period} row missing {k}: {row}"
                assert "_id" not in row
            units = [r_["units"] for r_ in d["by_units"]]
            assert units == sorted(units, reverse=True), f"by_units not sorted: {units}"
            profits = [r_["profit"] for r_ in d["by_profit"]]
            assert profits == sorted(profits, reverse=True), f"by_profit not sorted: {profits}"

    def test_bom_product_cost_known_and_real_profit(self, admin, seed):
        pid = seed["product"]["id"]
        r0 = admin.post(f"{API}/orders", json={"items": [{"product_id": pid, "qty": 3}]}, timeout=60)
        assert r0.status_code == 200, r0.text[:300]
        order = r0.json()
        seed["created"]["orders"].append(order["id"])

        r = admin.get(f"{API}/finance/best-sellers", params={"period": "month"}, timeout=60)
        assert r.status_code == 200
        rows = {x["name"]: x for x in r.json()["by_units"] + r.json()["by_profit"]}
        row = rows.get("TEST_BoM_Product_P24")
        assert row, f"BoM product missing from best-sellers: {list(rows)}"
        assert row["cost_known"] is True
        assert row["unit_cost"] == pytest.approx(5.0, abs=0.01), row
        # profit = revenue - unit_cost*units
        assert row["profit"] == pytest.approx(row["revenue"] - row["unit_cost"] * row["units"], abs=0.05), row
        assert row["unit_profit"] > 0
        assert isinstance(row["times_to_goal"], int)

    def test_no_bom_product_cost_unknown(self, admin, seed):
        pid = seed["product_nobom"]["id"]
        r0 = admin.post(f"{API}/orders", json={"items": [{"product_id": pid, "qty": 2}]}, timeout=60)
        assert r0.status_code == 200, r0.text[:300]
        seed["created"]["orders"].append(r0.json()["id"])
        r = admin.get(f"{API}/finance/best-sellers", timeout=60)
        row = next((x for x in r.json()["by_units"] if x["name"] == "TEST_NoBoM_Product_P24"), None)
        assert row, "no-BoM product missing"
        assert row["cost_known"] is False
        assert row["unit_cost"] is None
        assert row["profit"] == pytest.approx(row["revenue"], abs=0.01)


# ---------------- Phase 2: manual sale ----------------
class TestManualSale:
    def test_manual_sale_counts_in_best_sellers_and_goals(self, admin, seed):
        before = admin.get(f"{API}/finance/best-sellers", timeout=60).json()
        g_before = admin.get(f"{API}/finance/goals", timeout=60)
        assert g_before.status_code == 200, g_before.text[:300]
        sales_before = g_before.json().get("sales_month")

        r = admin.post(f"{API}/finance/manual-sale", json={
            "customer_name": "TEST_Client_P24",
            "items": [{"product_id": seed["product"]["id"], "name": "TEST_BoM_Product_P24",
                       "qty": 4, "unit_price": 20.0}]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        so = r.json()
        seed["created"]["orders"].append(so["id"])
        assert so["source"] == "manual"
        assert so["status"] == "completed"
        assert so["total"] == pytest.approx(80.0)
        assert "_id" not in so
        # product_id fills category
        assert so["items"][0]["category"] == "Signs", so["items"][0]

        # shows in orders list
        lst = admin.get(f"{API}/orders", timeout=30)
        assert lst.status_code == 200
        assert any(o["id"] == so["id"] for o in lst.json())

        # >= because tests may run in parallel workers creating extra sales
        after = admin.get(f"{API}/finance/best-sellers", timeout=60).json()
        assert after["total_units"] >= before["total_units"] + 4
        assert after["total_revenue"] >= before["total_revenue"] + 80.0 - 0.05

        g_after = admin.get(f"{API}/finance/goals", timeout=60).json()
        if sales_before is not None:
            assert g_after["sales_month"] >= sales_before + 80.0 - 0.05

    def test_manual_sale_without_product_id(self, admin, seed):
        r = admin.post(f"{API}/finance/manual-sale", json={
            "items": [{"name": "TEST_External_Item_P24", "qty": 2, "unit_price": 15.5}]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        so = r.json()
        seed["created"]["orders"].append(so["id"])
        assert so["items"][0]["category"] is None
        assert so["total"] == pytest.approx(31.0)
        assert so["customer_name"] == "External sale"

        bs = admin.get(f"{API}/finance/best-sellers", timeout=60).json()
        row = next((x for x in bs["by_units"] if x["name"] == "TEST_External_Item_P24"), None)
        assert row, "manual sale item not ranked"
        assert row["cost_known"] is False

    def test_manual_sale_empty_items_400(self, admin):
        r = admin.post(f"{API}/finance/manual-sale", json={"items": []}, timeout=30)
        assert r.status_code in (400, 422), f"{r.status_code} {r.text[:200]}"

    def test_manual_sale_date_only(self, admin, seed):
        r = admin.post(f"{API}/finance/manual-sale", json={
            "date": "2026-07-02",
            "items": [{"name": "TEST_Dated_P24", "qty": 1, "unit_price": 9.0}]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        so = r.json()
        seed["created"]["orders"].append(so["id"])
        assert so["created_at"].startswith("2026-07-02T12:00:00")


# ---------------- Phase 4: order P&L ----------------
class TestOrderPnL:
    def test_pnl_real_material_cost_and_ink(self, admin, seed):
        pid = seed["product"]["id"]
        r0 = admin.post(f"{API}/orders", json={"items": [{"product_id": pid, "qty": 5}]}, timeout=60)
        assert r0.status_code == 200, r0.text[:300]
        order = r0.json()
        oid = order["id"]
        seed["created"]["orders"].append(oid)
        assert order.get("inventory_deductions"), "no inventory deductions stored"
        assert order["inventory_deductions"][0].get("cost", 0) > 0, order["inventory_deductions"][0]

        r = admin.get(f"{API}/orders/{oid}/pnl", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["revenue", "quoted_cost", "quoted_known", "quoted_margin", "quoted_margin_pct",
                  "material_cost", "ink_cost", "real_cost", "real_known", "real_margin",
                  "real_margin_pct", "variance"]:
            assert k in d, f"pnl missing {k}"
        assert d["revenue"] == pytest.approx(order["total"])
        assert d["quoted_known"] is True
        assert d["quoted_cost"] == pytest.approx(25.0, abs=0.05), d   # 5 units * $5 BoM
        assert d["material_cost"] == pytest.approx(25.0, abs=0.05), d
        assert d["ink_cost"] == 0
        assert d["real_known"] is True
        assert d["real_margin"] == pytest.approx(d["revenue"] - d["real_cost"], abs=0.01)
        assert d["quoted_margin"] == pytest.approx(d["revenue"] - d["quoted_cost"], abs=0.01)
        assert d["variance"] == pytest.approx(d["real_margin"] - d["quoted_margin"], abs=0.01)

        # ---- deduct ink ----
        ri = admin.post(f"{API}/orders/{oid}/deduct-ink", json={
            "machine_id": seed["machine_id"], "area_sqft": 20.0, "coverage_pct": 100.0}, timeout=60)
        assert ri.status_code == 200, ri.text[:300]
        di = ri.json()
        assert "cost" in di, di
        assert di["cost"] > 0, di
        assert di["lines"] and di["lines"][0].get("cost", 0) > 0, di

        o2 = admin.get(f"{API}/orders/{oid}", timeout=30).json()
        assert o2["ink_deducted"]["cost"] == pytest.approx(di["cost"])

        r2 = admin.get(f"{API}/orders/{oid}/pnl", timeout=60).json()
        assert r2["ink_cost"] == pytest.approx(di["cost"], abs=0.01), r2
        assert r2["real_cost"] == pytest.approx(r2["material_cost"] + r2["ink_cost"], abs=0.01)
        assert r2["real_margin"] < d["real_margin"], "real margin did not drop after ink deduction"

        # double deduction blocked
        r3 = admin.post(f"{API}/orders/{oid}/deduct-ink", json={
            "machine_id": seed["machine_id"], "area_sqft": 5.0}, timeout=30)
        assert r3.status_code == 400, r3.status_code

    def test_pnl_manual_sale_no_real_cost(self, admin, seed):
        r = admin.post(f"{API}/finance/manual-sale", json={
            "items": [{"name": "TEST_PnL_Manual_P24", "qty": 1, "unit_price": 50.0}]}, timeout=30)
        oid = r.json()["id"]
        seed["created"]["orders"].append(oid)
        d = admin.get(f"{API}/orders/{oid}/pnl", timeout=30)
        assert d.status_code == 200, d.text[:300]
        j = d.json()
        assert j["revenue"] == pytest.approx(50.0)
        assert j["quoted_known"] is False
        assert j["real_known"] is False
        assert j["real_cost"] == 0

    def test_pnl_bad_order_id(self, admin):
        r = admin.get(f"{API}/orders/000000000000000000000000/pnl", timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"
