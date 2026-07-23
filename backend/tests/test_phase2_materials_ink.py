"""Phase 2 backend tests: unified Materials + Reorder Center + Ink calibration propagation."""
import os
import uuid
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    envf = Path("/app/frontend/.env")
    for line in envf.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("admin@printandsave.ca", "admin123")
RESELLER = ("cliente1@test.com", "test123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {_login(*ADMIN)}"})
    return s


@pytest.fixture(scope="module")
def reseller():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {_login(*RESELLER)}"})
    return s


# ============ Ink calibration propagation ============
class TestInkPropagation:
    def test_roland_largeformat_propagates(self, admin):
        machines = admin.get(f"{API}/machines").json()
        # Find a Roland eco-solvent largeformat machine (VersaCAMM VP-540i)
        targets = [m for m in machines if "roland" in m["name"].lower()
                   and m.get("category") == "largeformat"]
        assert len(targets) >= 2, f"Need >=2 Roland largeformat machines, found {[m['name'] for m in targets]}"
        # Pick VP-540i if present, else first
        primary = next((m for m in targets if "vp-540" in m["name"].lower()), targets[0])
        others = [m for m in targets if m["id"] != primary["id"]]

        payload = {"machine_id": primary["id"], "area_sqft": 10.0,
                   "coverage_pct": 50.0, "actual_ml": 42.0}
        r = admin.post(f"{API}/ink/calibrate", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "siblings_updated" in data
        assert data["siblings_updated"] > 0, f"Expected siblings updated, got {data}"
        new_val = data["new_ml_per_sqft_full"]

        # Verify GET /machines: other Roland LF machines got new_val
        machines2 = admin.get(f"{API}/machines").json()
        by_id = {m["id"]: m for m in machines2}
        for sib in others:
            got = by_id[sib["id"]]["ink_ml_per_sqft_full"]
            assert abs(got - new_val) < 0.01, (
                f"Sibling {sib['name']} not updated. Expected {new_val}, got {got}")

        # Roland directprint (LEJ/LEF) should NOT be affected
        dp = [m for m in machines2 if "roland" in m["name"].lower()
              and m.get("category") == "directprint"]
        for d in dp:
            before = next((x for x in machines if x["id"] == d["id"]), None)
            if before:
                assert d["ink_ml_per_sqft_full"] == before["ink_ml_per_sqft_full"], (
                    f"Roland directprint {d['name']} incorrectly changed")

        # Mimaki should be untouched
        mimaki = [m for m in machines2 if "mimaki" in m["name"].lower()]
        for d in mimaki:
            before = next((x for x in machines if x["id"] == d["id"]), None)
            if before:
                assert d["ink_ml_per_sqft_full"] == before["ink_ml_per_sqft_full"], (
                    f"Mimaki {d['name']} incorrectly changed")


# ============ Materials CRUD ============
class TestMaterials:
    def test_list_seeded_materials_computed(self, admin):
        r = admin.get(f"{API}/materials")
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        for m in items:
            assert "finish_cost" in m
            assert "retail_price" in m
            assert "selling_price" in m
            assert "low_stock" in m
            assert "below_cost" in m
            assert "_id" not in m

    def test_create_material_below_cost_flag(self, admin):
        payload = {
            "name": f"TEST_MAT_{uuid.uuid4().hex[:6]}",
            "category": "sheet",
            "unit": "sheet",
            "unit_cost": 100.0,
            "price_override": 50.0,  # below finish cost (100)
            "supplier_email": "TEST_supplier@example.com",
            "stock_qty": 20,
            "reorder_point": 5,
            "reorder_target": 30,
        }
        r = admin.post(f"{API}/materials", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["below_cost"] is True, f"Expected below_cost=True, got {d}"
        assert d["selling_price"] == 50.0
        assert d["finish_cost"] >= 100.0
        # cleanup
        admin.delete(f"{API}/materials/{d['id']}")

    def test_is_default_unsets_others(self, admin):
        # Create two materials in the same custom category
        cat = f"TEST_cat_{uuid.uuid4().hex[:6]}"
        a = admin.post(f"{API}/materials", json={"name": "TEST_A", "category": cat,
                                                  "unit_cost": 1, "is_default": True}).json()
        b = admin.post(f"{API}/materials", json={"name": "TEST_B", "category": cat,
                                                  "unit_cost": 1, "is_default": True}).json()
        # After b was created with is_default, a must no longer be default
        listing = admin.get(f"{API}/materials").json()
        by_id = {m["id"]: m for m in listing}
        assert by_id[b["id"]]["is_default"] is True
        assert by_id[a["id"]]["is_default"] is False, "Previous default was not unset"
        admin.delete(f"{API}/materials/{a['id']}")
        admin.delete(f"{API}/materials/{b['id']}")

    def test_put_and_delete_material(self, admin):
        created = admin.post(f"{API}/materials", json={
            "name": "TEST_PUT", "category": "sheet", "unit_cost": 5.0}).json()
        mid = created["id"]
        r = admin.put(f"{API}/materials/{mid}", json={
            "name": "TEST_PUT_UPDATED", "category": "sheet", "unit_cost": 9.0})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_PUT_UPDATED"
        assert r.json()["unit_cost"] == 9.0
        d = admin.delete(f"{API}/materials/{mid}")
        assert d.status_code == 200
        # verify gone
        listing = admin.get(f"{API}/materials").json()
        assert not any(m["id"] == mid for m in listing)


# ============ Stock adjust ============
class TestStockAdjust:
    def test_adjust_never_below_zero(self, admin):
        mat = admin.post(f"{API}/materials", json={
            "name": f"TEST_STK_{uuid.uuid4().hex[:6]}", "category": "sheet",
            "unit_cost": 1, "stock_qty": 3}).json()
        mid = mat["id"]
        r = admin.post(f"{API}/materials/{mid}/adjust-stock", json={"delta": -5})
        assert r.status_code == 200
        assert r.json()["stock_qty"] == 0.0
        r2 = admin.post(f"{API}/materials/{mid}/adjust-stock", json={"delta": 4})
        assert r2.json()["stock_qty"] == 4.0
        admin.delete(f"{API}/materials/{mid}")


# ============ Reorder center ============
class TestReorderCenter:
    def test_reorder_grouped_by_supplier(self, admin):
        # Create a low-stock material with unique supplier
        supplier_email = f"TEST_reorder_{uuid.uuid4().hex[:6]}@sup.example"
        mat = admin.post(f"{API}/materials", json={
            "name": "TEST_LOW", "category": "sheet", "unit_cost": 2,
            "supplier_email": supplier_email, "supplier_company": "TEST Co",
            "stock_qty": 1, "reorder_point": 5, "reorder_target": 20}).json()
        r = admin.get(f"{API}/materials/reorder")
        assert r.status_code == 200
        groups = r.json()
        # find our group
        g = next((x for x in groups if x.get("supplier_email") == supplier_email), None)
        assert g is not None, f"Group for {supplier_email} missing"
        item = next((it for it in g["items"] if it["id"] == mat["id"]), None)
        assert item is not None
        assert item["suggested_qty"] == 19.0  # 20 - 1
        admin.delete(f"{API}/materials/{mat['id']}")


# ============ Role scrubbing ============
class TestRoleScrubbing:
    def test_reseller_materials_scrubbed(self, reseller):
        r = reseller.get(f"{API}/materials")
        assert r.status_code == 200
        for m in r.json():
            for k in ["unit_cost", "finish_cost", "supplier_company",
                      "supplier_contact", "supplier_phone", "supplier_email", "stock_qty"]:
                assert k not in m, f"Field {k} leaked to non-admin: {m}"

    def test_reseller_forbidden_admin_ops(self, reseller):
        # POST
        r = reseller.post(f"{API}/materials", json={"name": "X", "category": "sheet"})
        assert r.status_code in (401, 403)
        # reorder GET
        r2 = reseller.get(f"{API}/materials/reorder")
        assert r2.status_code in (401, 403)
        # adjust-stock
        r3 = reseller.post(f"{API}/materials/fake/adjust-stock", json={"delta": 1})
        assert r3.status_code in (401, 403)
