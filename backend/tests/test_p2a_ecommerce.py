"""P2a E-commerce storefront: BoM inventory deduction with waste, role-based pricing,
orders/invoice, admin status change, RBAC, and dashboard real sales."""
import os
import pytest
import requests
import uuid

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@printandsave.ca", "password": "admin123"}
RESELLER = {"email": "cliente1@test.com", "password": "test123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def reseller_tok():
    return _login(RESELLER)


@pytest.fixture(scope="module")
def client_tok(admin_tok):
    # register a fresh client account
    email = f"TESTclient_{uuid.uuid4().hex[:8]}@test.com"
    pw = "test1234"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pw, "name": "TEST Client"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = _login({"email": email, "password": pw})
    # confirm role is client
    me = requests.get(f"{API}/auth/me", headers=_h(tok)).json()
    assert me.get("role") == "client", f"expected client, got {me.get('role')}"
    return tok


@pytest.fixture(scope="module")
def bom_material(admin_tok):
    body = {"name": f"BOMTEST_{uuid.uuid4().hex[:6]}", "category": "sheet",
            "unit": "sheet", "unit_cost": 0.25, "stock_qty": 100, "waste_per_order": 1}
    r = requests.post(f"{API}/materials", json=body, headers=_h(admin_tok))
    assert r.status_code in (200, 201), r.text
    d = r.json()
    mid = d.get("id") or d.get("_id")
    assert mid
    yield {"id": mid, "name": body["name"]}
    # cleanup
    requests.delete(f"{API}/materials/{mid}", headers=_h(admin_tok))


@pytest.fixture(scope="module")
def product(admin_tok, bom_material):
    body = {"name": f"100 BC BOMTEST_{uuid.uuid4().hex[:5]}", "category": "Business Cards",
            "price": 50, "wholesale_price": 30, "published": True,
            "bom": [{"material_id": bom_material["id"],
                     "material_name": bom_material["name"], "qty_per_unit": 5}]}
    r = requests.post(f"{API}/catalog-products", json=body, headers=_h(admin_tok))
    assert r.status_code in (200, 201), r.text
    d = r.json()
    pid = d.get("id") or d.get("_id")
    assert pid
    yield {"id": pid, **body}
    requests.delete(f"{API}/catalog-products/{pid}", headers=_h(admin_tok))


def _get_material(admin_tok, mid):
    r = requests.get(f"{API}/materials", headers=_h(admin_tok))
    assert r.status_code == 200
    for m in r.json():
        if (m.get("id") or m.get("_id")) == mid:
            return m
    return None


# =============== Role-based pricing ===============

class TestRolePricing:
    def test_admin_sees_both_prices(self, admin_tok, product):
        r = requests.get(f"{API}/catalog-products", headers=_h(admin_tok))
        assert r.status_code == 200
        p = next(x for x in r.json() if (x.get("id") or x.get("_id")) == product["id"])
        assert p["price"] == 50
        assert p["wholesale_price"] == 30
        assert p["your_price"] == 50  # admin = retail
        assert "bom" in p

    def test_reseller_sees_wholesale(self, reseller_tok, product):
        r = requests.get(f"{API}/catalog-products", headers=_h(reseller_tok))
        assert r.status_code == 200
        found = [x for x in r.json() if (x.get("id") or x.get("_id")) == product["id"]]
        assert found, "reseller should see published product"
        p = found[0]
        assert p["your_price"] == 30
        assert p.get("bom") is None or p.get("bom") == []  # bom hidden for non-admin

    def test_client_sees_retail_hides_wholesale(self, client_tok, product):
        r = requests.get(f"{API}/catalog-products", headers=_h(client_tok))
        assert r.status_code == 200
        p = next(x for x in r.json() if (x.get("id") or x.get("_id")) == product["id"])
        assert p["your_price"] == 50
        assert "wholesale_price" not in p
        assert p.get("bom") is None or p.get("bom") == []


# =============== Inventory deduction + waste ===============

class TestInventoryDeduction:
    _order_ids = []

    def test_reseller_order_qty1_deducts_6(self, reseller_tok, admin_tok, product, bom_material):
        before = _get_material(admin_tok, bom_material["id"])
        stock_before = before["stock_qty"]
        r = requests.post(f"{API}/orders",
                          json={"items": [{"product_id": product["id"], "qty": 1}]},
                          headers=_h(reseller_tok))
        assert r.status_code in (200, 201), r.text
        o = r.json()
        TestInventoryDeduction._order_ids.append(o.get("id") or o.get("_id"))
        # reseller list: no deductions field for non-admin
        # verify via admin
        oid = o.get("id") or o.get("_id")
        assert o["total"] == 30  # wholesale
        # admin fetch orders
        ao = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
        adm = next(x for x in ao if (x.get("id") or x.get("_id")) == oid)
        ded = adm["inventory_deductions"]
        assert len(ded) == 1
        d = ded[0]
        assert d["used"] == 5
        assert d["waste"] == 1
        assert d["total"] == 6
        after = _get_material(admin_tok, bom_material["id"])
        assert round(after["stock_qty"], 3) == round(stock_before - 6, 3)

    def test_reseller_order_qty2_deducts_11(self, reseller_tok, admin_tok, product, bom_material):
        before = _get_material(admin_tok, bom_material["id"])
        stock_before = before["stock_qty"]
        r = requests.post(f"{API}/orders",
                          json={"items": [{"product_id": product["id"], "qty": 2}]},
                          headers=_h(reseller_tok))
        assert r.status_code in (200, 201), r.text
        o = r.json()
        oid = o.get("id") or o.get("_id")
        TestInventoryDeduction._order_ids.append(oid)
        assert o["total"] == 60  # 30 * 2
        ao = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
        adm = next(x for x in ao if (x.get("id") or x.get("_id")) == oid)
        d = adm["inventory_deductions"][0]
        assert d["used"] == 10
        assert d["waste"] == 1
        assert d["total"] == 11
        after = _get_material(admin_tok, bom_material["id"])
        assert round(after["stock_qty"], 3) == round(stock_before - 11, 3)

    def test_client_order_uses_retail(self, client_tok, admin_tok, product):
        r = requests.post(f"{API}/orders",
                          json={"items": [{"product_id": product["id"], "qty": 1}]},
                          headers=_h(client_tok))
        assert r.status_code in (200, 201), r.text
        o = r.json()
        oid = o.get("id") or o.get("_id")
        TestInventoryDeduction._order_ids.append(oid)
        assert o["total"] == 50  # retail


# =============== Admin order status & RBAC ===============

class TestOrdersAndRBAC:
    def test_reseller_lists_only_own_orders(self, reseller_tok):
        r = requests.get(f"{API}/orders", headers=_h(reseller_tok))
        assert r.status_code == 200
        for o in r.json():
            # cliente1 email
            assert o.get("user_email") == RESELLER["email"] or o.get("role") == "reseller"
            assert "inventory_deductions" not in o  # non-admin doesn't see deductions

    def test_admin_sees_all_orders(self, admin_tok):
        r = requests.get(f"{API}/orders", headers=_h(admin_tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_admin_status_change_persists(self, admin_tok):
        orders = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
        assert orders
        oid = orders[0].get("id") or orders[0].get("_id")
        r = requests.put(f"{API}/orders/{oid}/status",
                         json={"status": "paid"}, headers=_h(admin_tok))
        assert r.status_code == 200, r.text
        # verify persisted
        again = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
        target = next(x for x in again if (x.get("id") or x.get("_id")) == oid)
        assert target["status"] == "paid"

    def test_reseller_cannot_change_status(self, reseller_tok, admin_tok):
        orders = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
        oid = orders[0].get("id") or orders[0].get("_id")
        r = requests.put(f"{API}/orders/{oid}/status",
                         json={"status": "cancelled"}, headers=_h(reseller_tok))
        assert r.status_code == 403

    def test_client_cannot_create_catalog_product(self, client_tok):
        r = requests.post(f"{API}/catalog-products",
                          json={"name": "TESTnope", "price": 1, "published": True},
                          headers=_h(client_tok))
        assert r.status_code == 403

    def test_reseller_cannot_delete_catalog(self, reseller_tok, product):
        r = requests.delete(f"{API}/catalog-products/{product['id']}",
                            headers=_h(reseller_tok))
        assert r.status_code == 403


# =============== Dashboard real sales ===============

class TestDashboard:
    def test_profit_dashboard_has_sales_and_net_real(self, admin_tok):
        r = requests.get(f"{API}/finance/profit-dashboard?months=6", headers=_h(admin_tok))
        assert r.status_code == 200
        d = r.json()
        assert "series" in d
        s = d["series"]
        assert len(s) >= 1
        latest = s[-1]
        assert "sales" in latest, latest
        assert "net_real" in latest
        assert latest["sales"] > 0, f"expected sales > 0 this month, got {latest}"

    def test_reseller_cannot_access_dashboard(self, reseller_tok):
        r = requests.get(f"{API}/finance/profit-dashboard", headers=_h(reseller_tok))
        assert r.status_code == 403


# =============== Regression: cancelled excluded from sales ===============

class TestCancellationRegression:
    def test_cancelled_excluded_from_sales(self, admin_tok, reseller_tok, product):
        # baseline
        d1 = requests.get(f"{API}/finance/profit-dashboard", headers=_h(admin_tok)).json()
        baseline = d1["series"][-1]["sales"]
        # place order
        r = requests.post(f"{API}/orders",
                          json={"items": [{"product_id": product["id"], "qty": 1}]},
                          headers=_h(reseller_tok))
        oid = r.json().get("id") or r.json().get("_id")
        d2 = requests.get(f"{API}/finance/profit-dashboard", headers=_h(admin_tok)).json()
        assert d2["series"][-1]["sales"] >= baseline + 30
        # cancel
        requests.put(f"{API}/orders/{oid}/status",
                     json={"status": "cancelled"}, headers=_h(admin_tok))
        d3 = requests.get(f"{API}/finance/profit-dashboard", headers=_h(admin_tok)).json()
        assert d3["series"][-1]["sales"] <= d2["series"][-1]["sales"] - 30 + 0.01


# =============== Cleanup ===============

def test_zzz_cleanup(admin_tok):
    """Delete all TEST orders and users placed during this run."""
    # delete orders created by reseller and TEST clients
    orders = requests.get(f"{API}/orders", headers=_h(admin_tok)).json()
    for o in orders:
        email = o.get("user_email") or ""
        if email.startswith("TESTclient_") or email == RESELLER["email"]:
            oid = o.get("id") or o.get("_id")
            # no DELETE endpoint expected; skip if missing
            requests.delete(f"{API}/orders/{oid}", headers=_h(admin_tok))
    # delete TEST client users
    users = requests.get(f"{API}/users", headers=_h(admin_tok))
    if users.status_code == 200:
        for u in users.json():
            if (u.get("email") or "").startswith("TESTclient_"):
                uid = u.get("id") or u.get("_id")
                requests.delete(f"{API}/users/{uid}", headers=_h(admin_tok))
