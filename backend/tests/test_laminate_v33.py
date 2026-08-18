"""Iteration 33 tests — Laminate/Hot-Foil per-roll matched-set deduction (`sides`),
paper-quote per-sheet override pricing, and GET /api/materials scrubbing for laminate/foil.

Feature contract (iteration 33 – extends iteration 32):
- deduct_inventory_for_order now consumes `sides` physical rolls per completed roll-length
  cycle (2-sided lamination runs top+bottom rolls in parallel).
    * lam_sides=2 + 500ft/500ft-roll -> stock -2 rolls, remainder 0
    * lam_sides=1 + 500ft/500ft-roll -> stock -1 roll,  remainder 0
    * partial (<500ft) -> stock -0, remainder carried in lam_open_used_ft
- /api/calc/paper: per-sheet override retail/wholesale (defined @12x18, 2 sides) is
  converted to per_ft = override/3.0 and applied as sheets * per_ft * sheet_len_ft * sides
  (1-side value is exactly half of 2-side value).  Falls back to markup-on-cost when
  overrides are 0.
- GET /api/materials returns lam_per_ft / finish_cost / lam_ref_cost_1 / lam_ref_cost_2 /
  selling_price / wholesale_price for laminate & hot_foil to admin; for non-admin the
  cost-bearing fields (lam_per_ft, lam_ref_cost_1, lam_ref_cost_2, finish_cost,
  wholesale_price) are scrubbed.
"""
import os
import time
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"
RESELLER_EMAIL = "cliente1@test.com"
RESELLER_PASSWORD = "test123"


# ----------------- fixtures -----------------
def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def reseller_client():
    return _login(RESELLER_EMAIL, RESELLER_PASSWORD)


@pytest.fixture(scope="module")
def client_client():
    """Self-register a new client (defaults to role=client)."""
    email = f"TEST_v33_client_{int(time.time())}@test.com"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "test123", "name": "TEST v33 client"}, timeout=15)
    assert r.status_code == 200, f"register client failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture
def laminate_material(admin_client):
    """Laminate with override retail=$2.00 / wholesale=$1.50 per 12x18 sheet @ 2 sides."""
    payload = {
        "name": "TEST_Lam_v33",
        "code": "TEST-LAM-V33",
        "category": "paper",
        "unit": "ft",
        "paper_type": "laminate",
        "lam_width_in": 12.75,
        "lam_length_ft": 500,
        "lam_roll_cost": 80.0,
        "lam_retail_per_sheet": 2.00,
        "lam_wholesale_per_sheet": 1.50,
        "stock_qty": 10,
        "reorder_point": 2,
    }
    r = admin_client.post(f"{BASE_URL}/api/materials", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    m = r.json()
    yield m
    admin_client.delete(f"{BASE_URL}/api/materials/{m['id']}", timeout=15)


@pytest.fixture
def laminate_no_override(admin_client):
    """Laminate without per-sheet override — falls back to markup-on-cost."""
    payload = {
        "name": "TEST_Lam_NoOverride",
        "code": "TEST-LAM-NO",
        "category": "paper",
        "unit": "ft",
        "paper_type": "laminate",
        "lam_width_in": 12.75,
        "lam_length_ft": 500,
        "lam_roll_cost": 80.0,
        "stock_qty": 10,
    }
    r = admin_client.post(f"{BASE_URL}/api/materials", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    m = r.json()
    yield m
    admin_client.delete(f"{BASE_URL}/api/materials/{m['id']}", timeout=15)


def _seed_catalog_product(mongo, lam_mid, ft_per_order, sides=1):
    doc = {
        "name": f"TEST_LamProd_v33_s{sides}",
        "category": "Other",
        "module": "paper",
        "price": 100.0,
        "wholesale_price": 80.0,
        "description": "roll deduction test",
        "published": True,
        "bom": [],
        "lam_material_id": lam_mid,
        "lam_ft_per_order": float(ft_per_order),
        "lam_sides": int(sides),
        "created_at": "2026-01-01T00:00:00",
    }
    return mongo.catalog_products.insert_one(doc).inserted_id


# ============================================================
# 1) Roll deduction with matched-set `sides` semantics
# ============================================================
class TestRollDeductionSides:
    def test_two_sides_consumes_two_rolls_per_full_cycle(self, admin_client, mongo, laminate_material):
        """sides=2 + 500ft usage on a 500ft roll -> stock_qty -= 2 rolls, remainder=0."""
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0, "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 500, sides=2)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST v33 sides2"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 8.0, \
                f"expected 10-2=8 rolls with sides=2, got {m['stock_qty']}"
            assert abs(float(m["lam_open_used_ft"]) - 0.0) < 0.01
            # Verify deduction record on the order too
            body = r.json()
            deds = [d for d in body.get("inventory_deductions", []) if d.get("material_id") == mid]
            assert deds, "no laminate deduction recorded on the order"
            d0 = deds[0]
            assert d0.get("sides") == 2
            assert d0.get("used") == 2, f"deduction 'used' rolls should be 2, got {d0.get('used')}"
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST v33"}})

    def test_one_side_consumes_one_roll_per_full_cycle(self, admin_client, mongo, laminate_material):
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0, "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 500, sides=1)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST v33 sides1"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 9.0
            assert abs(float(m["lam_open_used_ft"]) - 0.0) < 0.01
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST v33"}})

    def test_partial_usage_below_roll_length_decrements_zero_rolls(self, admin_client, mongo, laminate_material):
        """250 ft used with sides=2 on a 500ft roll -> stock_qty unchanged, remainder=250 in lam_open_used_ft."""
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0, "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 250, sides=2)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST v33 partial"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 10.0, \
                f"partial usage must NOT deplete rolls, got {m['stock_qty']}"
            assert abs(float(m["lam_open_used_ft"]) - 250.0) < 0.01
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST v33"}})

    def test_two_sides_multi_roll_cycle_in_single_order(self, admin_client, mongo, laminate_material):
        """1250 ft used, sides=2, on 500ft rolls: cycles=2 -> rolls_consumed=4, remainder=250."""
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0, "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 1250, sides=2)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST v33 multi2"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 6.0, \
                f"expected 10-4=6 rolls, got {m['stock_qty']}"
            assert abs(float(m["lam_open_used_ft"]) - 250.0) < 0.01
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST v33"}})


# ============================================================
# 2) /api/calc/paper per-sheet override pricing
# ============================================================
class TestPaperCalcOverridePricing:
    def _get_normal_paper_and_product(self, mongo):
        prod = mongo.products.find_one({"finished_w": 3.5})  # Business Card
        assert prod is not None, "seed product 'Business Card' missing"
        stock = mongo.materials.find_one({"category": "paper",
                                          "paper_type": {"$in": ["normal", None]},
                                          "sheets_per_box": {"$gt": 0}})
        assert stock is not None, "no normal paper stock available"
        return str(prod["_id"]), str(stock["_id"])

    def test_override_two_sides_equals_override_amount_and_double_one_side(
            self, admin_client, mongo, laminate_material):
        """Override retail=$2.00 @12x18/2sides. sheet_key=12x18 -> sheet_len_ft=1.5.
        per_ft_override = 2.0/3 = 0.6667. For qty=25 Business Card, sheets=1.
        lamination_retail(sides=2) = 1 * 0.6667 * 1.5 * 2 = 2.00
        lamination_retail(sides=1) = 1.00 (half of 2-side).
        """
        prod_id, stock_id = self._get_normal_paper_and_product(mongo)
        body_common = {"product_id": prod_id, "sheet_key": "12x18",
                       "stock_ids": [stock_id], "laminate": True,
                       "laminate_id": laminate_material["id"]}

        # 2 sides
        r2 = admin_client.post(f"{BASE_URL}/api/calc/paper",
                               json={**body_common, "laminate_sides": 2}, timeout=15)
        assert r2.status_code == 200, r2.text
        results2 = r2.json()["results"]
        assert results2, "no calc results returned"
        row2_25 = results2[0]["quote"]["rows"][0]  # qty=25 (smallest qty -> no volume discount)
        sheets2 = row2_25["sheets"]
        lam_ret_2 = row2_25["lamination_retail"]
        lam_ws_2 = row2_25["lamination_wholesale"]

        # 1 side
        r1 = admin_client.post(f"{BASE_URL}/api/calc/paper",
                               json={**body_common, "laminate_sides": 1}, timeout=15)
        assert r1.status_code == 200, r1.text
        row1_25 = r1.json()["results"][0]["quote"]["rows"][0]
        sheets1 = row1_25["sheets"]
        lam_ret_1 = row1_25["lamination_retail"]
        lam_ws_1 = row1_25["lamination_wholesale"]
        assert sheets1 == sheets2, "sheet count should be identical between 1/2 sides"

        # Override retail = $2.00 per 12x18 sheet @ 2 sides -> per_ft = 2/3
        # lamination_retail = sheets * per_ft * sheet_len_ft(1.5) * sides
        expected_2 = round(sheets2 * (2.0/3.0) * 1.5 * 2, 2)
        expected_1 = round(sheets2 * (2.0/3.0) * 1.5 * 1, 2)
        assert abs(lam_ret_2 - expected_2) < 0.05, \
            f"lam retail@2sides expected {expected_2} (=sheets({sheets2})*override), got {lam_ret_2}"
        # Note: at qty=25 no volume discount is applied so exact equality holds.
        assert abs(lam_ret_1 - expected_1) < 0.05, \
            f"lam retail@1side expected {expected_1}, got {lam_ret_1}"
        assert abs(lam_ws_2 - round(sheets2 * (1.5/3.0) * 1.5 * 2, 2)) < 0.05
        assert abs(lam_ws_1 - round(sheets2 * (1.5/3.0) * 1.5 * 1, 2)) < 0.05

        # 1-side must be exactly half of 2-side value
        assert abs(lam_ret_1 * 2 - lam_ret_2) < 0.05, \
            f"1-side retail should be half of 2-side (got {lam_ret_1} vs {lam_ret_2})"
        assert abs(lam_ws_1 * 2 - lam_ws_2) < 0.05, \
            f"1-side wholesale should be half of 2-side (got {lam_ws_1} vs {lam_ws_2})"

    def test_no_override_falls_back_to_markup_and_scales_linearly(
            self, admin_client, mongo, laminate_no_override):
        """When lam_retail_per_sheet=0 (falsy), pricing falls back to markup-on-cost.
        1-side must still be exactly half of 2-side (markup is linear on cost)."""
        prod_id, stock_id = self._get_normal_paper_and_product(mongo)
        body_common = {"product_id": prod_id, "sheet_key": "12x18",
                       "stock_ids": [stock_id], "laminate": True,
                       "laminate_id": laminate_no_override["id"]}

        r2 = admin_client.post(f"{BASE_URL}/api/calc/paper",
                               json={**body_common, "laminate_sides": 2}, timeout=15)
        r1 = admin_client.post(f"{BASE_URL}/api/calc/paper",
                               json={**body_common, "laminate_sides": 1}, timeout=15)
        assert r2.status_code == 200 and r1.status_code == 200

        row2 = r2.json()["results"][0]["quote"]["rows"][0]
        row1 = r1.json()["results"][0]["quote"]["rows"][0]

        # Must be positive (markup applied on cost)
        assert row2["lamination_retail"] > 0
        assert row2["lamination_cost"] > 0
        # And 1-side == half of 2-side
        assert abs(row1["lamination_retail"] * 2 - row2["lamination_retail"]) < 0.05, \
            f"markup fallback: 1-side should be half of 2-side ({row1['lamination_retail']} vs {row2['lamination_retail']})"
        assert abs(row1["lamination_cost"] * 2 - row2["lamination_cost"]) < 0.05


# ============================================================
# 3) GET /api/materials laminate/foil display fields + role scrubbing
# ============================================================
class TestMaterialsListLamFields:
    def test_admin_receives_all_lam_fields(self, admin_client, laminate_material):
        r = admin_client.get(f"{BASE_URL}/api/materials", timeout=15)
        assert r.status_code == 200
        rows = [m for m in r.json() if m["id"] == laminate_material["id"]]
        assert len(rows) == 1, "created laminate missing in list"
        m = rows[0]
        # paper-style display fields must be present for admin
        for k in ("lam_per_ft", "finish_cost", "lam_ref_cost_1", "lam_ref_cost_2",
                  "selling_price", "wholesale_price"):
            assert k in m, f"admin: missing field {k}"
        # sanity values: lam_per_ft = 80/500 = 0.16, c1 = 0.16*1.5 = 0.24, c2 = 0.48
        assert abs(m["lam_per_ft"] - 0.16) < 0.01
        assert abs(m["lam_ref_cost_1"] - 0.24) < 0.01
        assert abs(m["lam_ref_cost_2"] - 0.48) < 0.01
        # override was 2.00 / 1.50 @ 2 sides
        assert abs(m["selling_price"] - 2.00) < 0.01
        assert abs(m["wholesale_price"] - 1.50) < 0.01

    def test_reseller_lam_cost_fields_scrubbed(self, reseller_client, laminate_material):
        r = reseller_client.get(f"{BASE_URL}/api/materials", timeout=15)
        assert r.status_code == 200
        rows = [m for m in r.json() if m["id"] == laminate_material["id"]]
        assert len(rows) == 1
        m = rows[0]
        # Cost fields MUST be scrubbed for non-admin
        for k in ("lam_per_ft", "lam_ref_cost_1", "lam_ref_cost_2",
                  "finish_cost", "wholesale_price", "unit_cost"):
            assert k not in m, f"reseller: field {k} should be scrubbed, got value={m.get(k)}"
        # Retail-facing selling_price still visible
        assert "selling_price" in m

    def test_client_lam_cost_fields_scrubbed(self, client_client, laminate_material):
        r = client_client.get(f"{BASE_URL}/api/materials", timeout=15)
        assert r.status_code == 200
        rows = [m for m in r.json() if m["id"] == laminate_material["id"]]
        assert len(rows) == 1
        m = rows[0]
        for k in ("lam_per_ft", "lam_ref_cost_1", "lam_ref_cost_2",
                  "finish_cost", "wholesale_price"):
            assert k not in m, f"client: field {k} should be scrubbed"
        assert "selling_price" in m
