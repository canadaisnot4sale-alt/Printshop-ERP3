"""Tests for new features (iteration 20):
- default material per module (roll-materials + materials CRUD)
- dynamic BoM pricing on catalog products
- per-product waste + waste-suggestion + order deduction
"""
import os, time
import pytest
import requests

def _load_env():
    for p in ("/app/frontend/.env",):
        try:
            for line in open(p):
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ.setdefault(k, v)
        except FileNotFoundError:
            pass
_load_env()
BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@printandsave.ca", "password": "admin123"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- helpers ----------
def get_vinyl(H):
    r = requests.get(f"{API}/materials", headers=H, timeout=30)
    assert r.status_code == 200
    for m in r.json():
        if "Eco-Solvent Vinyl 54in Gloss" in m.get("name", ""):
            return m
    return None


# ---------- Default per module ----------
class TestDefaultPerModule:
    def test_vinyl_default_in_large_format_not_stickers(self, H):
        v = get_vinyl(H)
        assert v, "seeded vinyl material missing"
        assert "large-format" in (v.get("default_modules") or []), v
        assert "stickers" not in (v.get("default_modules") or [])

    def test_roll_materials_large_format_default_first(self, H):
        r = requests.get(f"{API}/roll-materials", params={"module": "large-format"}, headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert items, "no roll-materials returned"
        # First item must be default
        assert items[0].get("is_default") is True, items[0]
        # It should be the vinyl
        assert "Eco-Solvent Vinyl 54in Gloss" in items[0].get("name", ""), items[0]

    def test_roll_materials_stickers_vinyl_not_default(self, H):
        r = requests.get(f"{API}/roll-materials", params={"module": "stickers"}, headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert items
        vinyl = next((i for i in items if "Eco-Solvent Vinyl 54in Gloss" in i.get("name", "")), None)
        assert vinyl is not None, "vinyl should still be listed for stickers"
        assert vinyl.get("is_default") is False, vinyl

    def test_unique_default_per_module(self, H):
        # Pick another material assigned to large-format, mark it default; vinyl should lose default.
        r = requests.get(f"{API}/materials", headers=H, timeout=30)
        mats = r.json()
        vinyl = next(m for m in mats if "Eco-Solvent Vinyl 54in Gloss" in m["name"])
        other = next((m for m in mats
                      if m["id"] != vinyl["id"]
                      and "large-format" in (m.get("modules") or [])), None)
        if not other:
            pytest.skip("no other large-format material to toggle")
        # Save current defaults so we can restore
        other_dm = list(other.get("default_modules") or [])
        vinyl_dm = list(vinyl.get("default_modules") or [])
        try:
            body = {**other, "default_modules": list(set(other_dm + ["large-format"]))}
            body.pop("id", None); body.pop("_id", None); body.pop("is_default", None)
            up = requests.put(f"{API}/materials/{other['id']}", headers=H, json=body, timeout=30)
            assert up.status_code == 200, up.text
            # Reload vinyl -> should no longer contain large-format
            v2 = get_vinyl({"Authorization": H["Authorization"]})
            assert "large-format" not in (v2.get("default_modules") or []), v2
            # Roll materials list -> "other" now default first
            r2 = requests.get(f"{API}/roll-materials", params={"module": "large-format"}, headers=H, timeout=30)
            assert r2.json()[0]["is_default"] is True
            assert r2.json()[0].get("id") == other["id"] or r2.json()[0].get("name") == other["name"]
        finally:
            # restore
            restore_other = {**other, "default_modules": other_dm}
            restore_other.pop("id", None); restore_other.pop("_id", None); restore_other.pop("is_default", None)
            requests.put(f"{API}/materials/{other['id']}", headers=H, json=restore_other, timeout=30)
            restore_vinyl = {**vinyl, "default_modules": vinyl_dm}
            restore_vinyl.pop("id", None); restore_vinyl.pop("_id", None); restore_vinyl.pop("is_default", None)
            requests.put(f"{API}/materials/{vinyl['id']}", headers=H, json=restore_vinyl, timeout=30)


# ---------- Dynamic pricing ----------
class TestDynamicPricing:
    @pytest.fixture(scope="class")
    def product(self, H):
        vinyl = get_vinyl(H)
        assert vinyl
        body = {
            "name": "TEST_dyn_product",
            "category": "Other",
            "module": "large-format",
            "price": 0.0,
            "wholesale_price": 0.0,
            "retail_markup_pct": 200.0,
            "wholesale_markup_pct": 100.0,
            "published": True,
            "bom": [{
                "material_id": vinyl["id"],
                "material_name": vinyl["name"],
                "qty_per_unit": 1.0,
                "waste_per_order": 0.5,
                "waste_per_unit": 0.1,
            }]
        }
        r = requests.post(f"{API}/catalog-products", headers=H, json=body, timeout=30)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        yield {"id": pid, "vinyl": vinyl}
        requests.delete(f"{API}/catalog-products/{pid}", headers=H, timeout=30)

    def test_dynamic_pricing_flag_and_computed_cost(self, H, product):
        r = requests.get(f"{API}/catalog-products", headers=H, timeout=30)
        p = next(x for x in r.json() if x["id"] == product["id"])
        assert p.get("dynamic_pricing") is True, p
        assert "computed_cost" in p
        vinyl_cost = product["vinyl"].get("unit_cost") or 0
        expected_price = round(vinyl_cost * (1 + 200.0 / 100.0), 2)
        assert abs(p["price"] - expected_price) < 0.02, (p, vinyl_cost)
        assert abs(p.get("computed_cost", 0) - vinyl_cost) < 0.01

    def test_cost_propagation(self, H, product):
        vinyl = product["vinyl"]
        old_cost = vinyl.get("unit_cost") or 0
        new_cost = round(old_cost + 1.0, 4)
        body = {**vinyl, "unit_cost": new_cost}
        body.pop("id", None); body.pop("_id", None); body.pop("is_default", None)
        try:
            up = requests.put(f"{API}/materials/{vinyl['id']}", headers=H, json=body, timeout=30)
            assert up.status_code == 200, up.text
            r = requests.get(f"{API}/catalog-products", headers=H, timeout=30)
            p = next(x for x in r.json() if x["id"] == product["id"])
            expected_price = round(new_cost * 3.0, 2)
            assert abs(p["price"] - expected_price) < 0.05, (p, new_cost)
        finally:
            restore = {**vinyl, "unit_cost": old_cost}
            restore.pop("id", None); restore.pop("_id", None); restore.pop("is_default", None)
            requests.put(f"{API}/materials/{vinyl['id']}", headers=H, json=restore, timeout=30)


# ---------- Waste suggestion & order deduction ----------
class TestWasteAndOrderDeduction:
    def test_waste_suggestion_endpoint(self, H):
        vinyl = get_vinyl(H)
        # Create a product using vinyl w/ specific waste
        body = {
            "name": "TEST_waste_seed",
            "category": "Banners",
            "module": "large-format",
            "price": 0.0,
            "published": True,
            "bom": [{"material_id": vinyl["id"], "material_name": vinyl["name"],
                     "qty_per_unit": 2.0, "waste_per_order": 1.0, "waste_per_unit": 0.2}]
        }
        pr = requests.post(f"{API}/catalog-products", headers=H, json=body, timeout=30)
        pid = pr.json()["id"]
        try:
            r = requests.get(f"{API}/products/waste-suggestion",
                             params={"material_id": vinyl["id"],
                                     "category": "Banners",
                                     "module": "large-format"},
                             headers=H, timeout=30)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("samples", 0) >= 1
            assert data.get("waste_per_order", 0) > 0
            assert data.get("waste_per_unit", 0) > 0
        finally:
            requests.delete(f"{API}/catalog-products/{pid}", headers=H, timeout=30)

    def test_order_deducts_qty_plus_waste(self, H):
        vinyl = get_vinyl(H)
        # Set stock to a known value
        old_stock = vinyl.get("stock_qty") or 0
        set_body = {**vinyl, "stock_qty": 1000.0}
        set_body.pop("id", None); set_body.pop("_id", None); set_body.pop("is_default", None)
        requests.put(f"{API}/materials/{vinyl['id']}", headers=H, json=set_body, timeout=30)
        # Product w/ qty_per_unit=10, waste_per_order=2, waste_per_unit=0.1
        pbody = {
            "name": "TEST_order_deduct",
            "category": "Other",
            "module": "large-format",
            "published": True,
            "bom": [{"material_id": vinyl["id"], "material_name": vinyl["name"],
                     "qty_per_unit": 10.0, "waste_per_order": 2.0, "waste_per_unit": 0.1}]
        }
        pr = requests.post(f"{API}/catalog-products", headers=H, json=pbody, timeout=30)
        assert pr.status_code == 200, pr.text
        pid = pr.json()["id"]
        try:
            # Order qty=3 -> used = 30, waste = 2 + 0.1*3 = 2.3
            order = requests.post(f"{API}/orders", headers=H,
                                  json={"items": [{"product_id": pid, "qty": 3}]}, timeout=30)
            assert order.status_code == 200, order.text
            dedu = order.json()["inventory_deductions"]
            row = next(d for d in dedu if d["material_id"] == vinyl["id"])
            assert abs(row["used"] - 30.0) < 0.001, row
            assert abs(row["waste"] - 2.3) < 0.001, row
            assert abs(row["total"] - 32.3) < 0.001, row
            # cleanup order
            oid = order.json()["id"]
            requests.delete(f"{API}/orders/{oid}", headers=H, timeout=30)
        finally:
            requests.delete(f"{API}/catalog-products/{pid}", headers=H, timeout=30)
            restore = {**vinyl, "stock_qty": old_stock}
            restore.pop("id", None); restore.pop("_id", None); restore.pop("is_default", None)
            requests.put(f"{API}/materials/{vinyl['id']}", headers=H, json=restore, timeout=30)
