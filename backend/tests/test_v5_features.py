"""V5 backend tests: sublimation, roll stickers, equipment by module, supplies, catalog derivation."""
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
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {_login(*ADMIN)}"})
    return s


@pytest.fixture(scope="module")
def reseller_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {_login(*RESELLER)}"})
    return s


@pytest.fixture(scope="module")
def client_session():
    email = f"TEST_v5client_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "V5 Client"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ============ Sublimation ============
class TestSublimation:
    def test_products_seeded(self, admin_session):
        r = admin_session.get(f"{API}/sublimation-products")
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) > 0
        assert all("_id" not in p for p in prods)

    def test_calc_frame_paper_use(self, admin_session):
        prods = admin_session.get(f"{API}/sublimation-products").json()
        frame = next((p for p in prods if p.get("uses_paper")), prods[0])
        r = admin_session.post(f"{API}/calc/sublimation", json={"product_id": frame["id"], "quantity": 25})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["quantity"] == 25
        assert d["blank_cost"] > 0
        assert "retail_total" in d and "wholesale_total" in d
        if frame.get("uses_paper"):
            assert d["paper_used_in"] > 0
            assert d["material_cost"] > 0

    def test_client_only_retail(self, client_session):
        prods = client_session.get(f"{API}/sublimation-products").json()
        r = client_session.post(f"{API}/calc/sublimation", json={"product_id": prods[0]["id"], "quantity": 10})
        assert r.status_code == 200
        d = r.json()
        assert "retail_total" in d
        assert "wholesale_total" not in d or d.get("wholesale_total") is None

    def test_reseller_only_wholesale(self, reseller_session):
        prods = reseller_session.get(f"{API}/sublimation-products").json()
        r = reseller_session.post(f"{API}/calc/sublimation", json={"product_id": prods[0]["id"], "quantity": 10})
        assert r.status_code == 200
        d = r.json()
        assert "wholesale_total" in d
        assert "retail_total" not in d or d.get("retail_total") is None

    def test_admin_product_crud(self, admin_session):
        payload = {"name": "TEST_SubProd", "category": "mug", "model": "T1", "price_per_box": 100, "pieces_per_box": 36,
                   "cost_per_unit": 3, "uses_paper": True, "print_bleed_w": 8.5, "print_bleed_h": 3.5}
        r = admin_session.post(f"{API}/sublimation-products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = admin_session.put(f"{API}/sublimation-products/{pid}", json={**payload, "price_per_box": 150})
        assert r2.status_code == 200
        assert r2.json()["price_per_box"] == 150
        admin_session.delete(f"{API}/sublimation-products/{pid}")

    def test_client_cannot_crud_products(self, client_session):
        r = client_session.post(f"{API}/sublimation-products", json={"name": "X", "price_per_box": 1})
        assert r.status_code in (401, 403)


# ============ Roll Stickers ============
class TestRollStickers:
    def test_materials_seeded(self, admin_session):
        r = admin_session.get(f"{API}/roll-sticker-materials")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_calc_500_pieces(self, admin_session):
        mats = admin_session.get(f"{API}/roll-sticker-materials").json()
        r = admin_session.post(f"{API}/calc/rollsticker", json={"material_id": mats[0]["id"], "quantity": 500})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rolls_needed"] >= 1
        assert d["waste_pieces"] == 5
        assert d["production_minutes"] > 0
        assert d["material_cost"] > 0
        assert d["ink_cost"] > 0
        assert "retail_total" in d and "wholesale_total" in d

    def test_reseller_wholesale_only(self, reseller_session):
        mats = reseller_session.get(f"{API}/roll-sticker-materials").json()
        r = reseller_session.post(f"{API}/calc/rollsticker", json={"material_id": mats[0]["id"], "quantity": 200})
        assert r.status_code == 200
        d = r.json()
        assert "wholesale_total" in d
        assert d.get("retail_total") is None

    def test_admin_material_crud(self, admin_session):
        payload = {"name": "TEST_RSMat", "paper_type": "matte", "roll_cost": 50, "pieces_per_roll": 1000,
                   "roll_width": 4, "sticker_w": 3, "sticker_h": 3}
        r = admin_session.post(f"{API}/roll-sticker-materials", json=payload)
        assert r.status_code == 200
        mid = r.json()["id"]
        admin_session.delete(f"{API}/roll-sticker-materials/{mid}")


# ============ Equipment by module + supplies ============
class TestEquipmentModule:
    def test_seeded_machines_by_module(self, admin_session):
        eq = admin_session.get(f"{API}/equipment").json()
        by_mod = {}
        for e in eq:
            by_mod.setdefault(e.get("module", "general"), []).append(e["name"])
        # Check specific seeded machines
        names = {e["name"] for e in eq}
        for expected in ["Konica AccurioPress C3080", "Glowforge Pro", "xTool F2",
                         "SureColor F570", "Epson ColorWorks C6000A"]:
            assert expected in names, f"Missing seeded machine: {expected}. Have {names}"
        # Module tags exist
        assert "paper" in by_mod
        assert "sublimation" in by_mod
        assert "rollsticker" in by_mod
        assert "laser" in by_mod

    def test_supplies_crud(self, admin_session):
        eq = admin_session.get(f"{API}/equipment").json()
        mach = eq[0]
        payload = {"equipment_id": mach["id"], "name": "TEST_supply", "supplier": "Acme",
                   "part_number": "P-001", "description": "Test", "price": 25.5,
                   "purchase_date": "2026-01-01", "install_date": "2026-01-05"}
        r = admin_session.post(f"{API}/equipment-supplies", json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        r2 = admin_session.get(f"{API}/equipment/{mach['id']}/supplies")
        assert r2.status_code == 200
        assert any(s["id"] == sid for s in r2.json())
        r3 = admin_session.delete(f"{API}/equipment-supplies/{sid}")
        assert r3.status_code == 200

    def test_client_cannot_access_equipment_supplies(self, client_session):
        r = client_session.post(f"{API}/equipment-supplies", json={"equipment_id": "x", "name": "X", "price": 1})
        assert r.status_code in (401, 403)


# ============ Catalog derivation from /quotes ============
class TestCatalog:
    def test_quotes_endpoint_returns_list(self, admin_session):
        r = admin_session.get(f"{API}/quotes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_new_settings_fields_present(self, admin_session):
        r = admin_session.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        for k in ["sublimation_paper_width", "sublimation_paper_length_ft", "sublimation_paper_roll_cost",
                  "sublimation_ink_per_sqft", "rollsticker_waste_pieces", "rollsticker_cleaning_cost",
                  "rollsticker_stickers_per_min"]:
            assert k in s, f"Missing settings field {k}"
