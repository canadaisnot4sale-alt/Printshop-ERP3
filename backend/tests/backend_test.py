"""Backend API tests for Print and Save ERP."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading from frontend .env
    from pathlib import Path
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    session.headers.update({"Authorization": f"Bearer {data['token']}"})
    return data


# ---------------- Auth ----------------
class TestAuth:
    def test_login_ok(self, session, auth):
        assert auth["user"]["email"] == ADMIN_EMAIL

    def test_login_bad(self, session):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session, auth):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard(self, session, auth):
        r = session.get(f"{API}/dashboard")
        assert r.status_code == 200
        for k in ["paper_stocks", "products", "roll_materials", "equipment", "sticker_materials", "size_presets"]:
            assert k in r.json()


# ---------------- Settings ----------------
class TestSettings:
    def test_get_settings(self, session, auth):
        r = session.get(f"{API}/settings")
        assert r.status_code == 200
        assert "retail_markup_pct" in r.json()

    def test_update_settings_persists(self, session, auth):
        r = session.get(f"{API}/settings")
        cur = r.json()
        cur.pop("_key", None)
        cur.pop("_id", None)
        original = cur.get("retail_markup_pct")
        cur["retail_markup_pct"] = 55.5
        r2 = session.put(f"{API}/settings", json=cur)
        assert r2.status_code == 200, r2.text
        r3 = session.get(f"{API}/settings")
        assert r3.json()["retail_markup_pct"] == 55.5
        # restore
        cur["retail_markup_pct"] = original
        session.put(f"{API}/settings", json=cur)


# ---------------- CRUD ----------------
class TestCRUD:
    def test_paper_stocks_list(self, session, auth):
        r = session.get(f"{API}/paper-stocks")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_paper_stock_crud(self, session, auth):
        payload = {"name": "TEST_Stock", "size": "13x19", "sheets_per_box": 500, "cost_per_box": 100.0}
        r = session.post(f"{API}/paper-stocks", json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["name"] == "TEST_Stock"
        assert "id" in item and "_id" not in item
        sid = item["id"]
        # update
        payload["cost_per_box"] = 200.0
        r2 = session.put(f"{API}/paper-stocks/{sid}", json=payload)
        assert r2.status_code == 200
        assert r2.json()["cost_per_box"] == 200.0
        # delete
        r3 = session.delete(f"{API}/paper-stocks/{sid}")
        assert r3.status_code == 200

    def test_product_crud(self, session, auth):
        r = session.post(f"{API}/products", json={"name": "TEST_Product", "finished_w": 8.5, "finished_h": 11})
        assert r.status_code == 200
        pid = r.json()["id"]
        session.delete(f"{API}/products/{pid}")

    def test_roll_material_crud(self, session, auth):
        r = session.post(f"{API}/roll-materials", json={
            "name": "TEST_Vinyl", "roll_width": 54, "printable_width": 52,
            "price_per_sqft": 0.5, "sticker_compatible": True, "material_type": "vinyl"
        })
        assert r.status_code == 200
        rid = r.json()["id"]
        session.delete(f"{API}/roll-materials/{rid}")

    def test_equipment_list(self, session, auth):
        r = session.get(f"{API}/equipment")
        assert r.status_code == 200

    def test_size_presets_list(self, session, auth):
        r = session.get(f"{API}/size-presets")
        assert r.status_code == 200


# ---------------- Calculations ----------------
class TestCalculations:
    def test_calc_paper(self, session, auth):
        products = session.get(f"{API}/products").json()
        if not products:
            pytest.skip("No seed products")
        r = session.post(f"{API}/calc/paper", json={"product_id": products[0]["id"], "sheet_key": "13x19"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "results" in j and isinstance(j["results"], list)

    def test_calc_booklet(self, session, auth):
        stocks = session.get(f"{API}/paper-stocks").json()
        if len(stocks) < 2:
            pytest.skip("Need at least 2 paper stocks")
        r = session.post(f"{API}/calc/booklet", json={
            "cover_stock_id": stocks[0]["id"], "inside_stock_id": stocks[1]["id"],
            "page_count": 16, "quantity": 100, "binding": "saddle"
        })
        assert r.status_code == 200, r.text
        assert "total_cost" in r.json()

    def test_calc_lf(self, session, auth):
        r = session.post(f"{API}/calc/largeformat", json={
            "sizes": [{"width": 24, "height": 36, "qty": 1}], "mode": "print", "laminate": False
        })
        assert r.status_code == 200, r.text
        assert "results" in r.json()

    def test_calc_sticker(self, session, auth):
        r = session.post(f"{API}/calc/sticker", json={"width": 3, "height": 3, "qty": 100})
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        # Verify only sticker-compatible materials
        mats = session.get(f"{API}/roll-materials").json()
        sticker_names = {m["name"] for m in mats if m.get("sticker_compatible")}
        for res in results:
            mat = res["material"]
            name = mat["name"] if isinstance(mat, dict) else mat
            assert name in sticker_names

    def test_calc_equipment(self, session, auth):
        eqs = session.get(f"{API}/equipment").json()
        if not eqs:
            pytest.skip("No equipment")
        r = session.get(f"{API}/calc/equipment/{eqs[0]['id']}")
        assert r.status_code == 200
        assert "cost" in r.json()


class TestAuthGuard:
    def test_dashboard_unauth(self):
        r = requests.get(f"{API}/dashboard")
        assert r.status_code == 401
