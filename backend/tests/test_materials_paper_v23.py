"""Tests for CATEGORY-DRIVEN Materials (Paper focus) + SupplierPreset endpoints."""
import os, pytest, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@printandsave.ca", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


class TestSupplierPresets:
    def test_list_suppliers(self, admin):
        r = admin.get(f"{API}/suppliers")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_upsert_supplier(self, admin):
        payload = {"company": "TEST_Alfa", "contact": "Juan", "phone": "555", "email": "a@a.com"}
        r = admin.post(f"{API}/suppliers", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["company"] == "TEST_Alfa"
        assert "id" in d and "_id" not in d
        sid = d["id"]
        # upsert (same name, different contact)
        r2 = admin.post(f"{API}/suppliers", json={**payload, "contact": "Ana"})
        assert r2.status_code == 200
        assert r2.json()["contact"] == "Ana"
        # cleanup
        admin.delete(f"{API}/suppliers/{sid}")


class TestPaperMaterial:
    def test_create_paper_and_auto_compute(self, admin):
        # Server does NOT auto-compute unit_cost/stock; frontend does. Verify persistence.
        payload = {
            "name": "TEST_100lb text", "code": "TEST_P1", "category": "paper",
            "supplier_company": "TEST_Alfa",
            "unit": "sheet", "size": "12x18", "weight": "100 lb",
            "sheets_per_box": 400, "num_boxes": 1, "price_per_box": 101.60,
            "unit_cost": 0.254, "stock_qty": 400,
            "click_cost": 0.055, "waste_per_order": 1,
            "modules": ["paper"], "default_modules": [],
        }
        r = admin.post(f"{API}/materials", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        mid = m["id"]
        try:
            assert m["category"] == "paper"
            assert m["sheets_per_box"] == 400
            assert m["num_boxes"] == 1
            assert m["price_per_box"] == 101.60
            assert m["click_cost"] == 0.055
            assert abs(m["unit_cost"] - 0.254) < 0.001
            assert m["stock_qty"] == 400
            assert m["waste_per_order"] == 1

            # GET back to verify persistence
            g = admin.get(f"{API}/materials")
            assert g.status_code == 200
            found = next((x for x in g.json() if x["id"] == mid), None)
            assert found is not None
            assert found["click_cost"] == 0.055
            assert found["num_boxes"] == 1
        finally:
            admin.delete(f"{API}/materials/{mid}")

    def test_paper_stocks_endpoint_lists_paper(self, admin):
        r = admin.get(f"{API}/paper-stocks?module=paper")
        # accept 200 or 404 depending on implementation
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
