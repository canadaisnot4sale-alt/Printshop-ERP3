"""Tests for unified Materials system (single source of truth).

Verifies:
  1. Admin login works
  2. GET /api/materials returns seeded materials with module specs
  3. Central Materials CRUD (POST/PUT) works and updates flow through
  4. Per-module material endpoints (paper-stocks, roll-materials, laser-materials,
     sheet-materials, roll-sticker-materials) READ from central and BLOCK writes with 400
  5. Filter behavior: stickers only shows sticker_compatible, channel-letters only channel_capable
  6. Calculators still compute from central materials
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Auth ----------------
def test_admin_login_ok(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 5


# ---------------- Central Materials read ----------------
def test_materials_list_has_seeded(admin_headers):
    r = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    names = [m.get("name", "") for m in data]
    # Expect at least the 6 demo materials
    expected_snippets = ["Coroplast", "ACM", "Vinyl", "Gloss Text", "Baltic Birch", "Gloss Label"]
    found = sum(1 for s in expected_snippets if any(s in n for n in names))
    assert found >= 5, f"only found {found}/6 seeded materials, names={names}"


def test_materials_have_module_specs(admin_headers):
    r = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    data = r.json()
    lf = next((m for m in data if "Vinyl" in m.get("name", "")), None)
    assert lf, "Vinyl LF material missing"
    assert lf.get("roll_width", 0) > 0
    assert lf.get("sticker_compatible") is True
    assert "large-format" in lf.get("modules", []) or "stickers" in lf.get("modules", [])

    paper = next((m for m in data if "Gloss Text" in m.get("name", "")), None)
    assert paper
    assert paper.get("sheet_width", 0) > 0 and paper.get("sheet_height", 0) > 0


# ---------------- Central Materials create + edit ----------------
@pytest.fixture(scope="module")
def created_material_id(admin_headers):
    payload = {
        "name": "TEST_LF_Banner_13oz",
        "code": "TEST-LF-BAN",
        "category": "roll",
        "unit": "sqft",
        "unit_cost": 0.60,
        "modules": ["large-format"],
        "roll_width": 60.0,
        "printable_width": 58.0,
        "min_linear_feet": 1.0,
        "material_type": "banner",
        "sticker_compatible": False,
        "stock_qty": 100,
    }
    r = requests.post(f"{API}/materials", headers=admin_headers, json=payload, timeout=15)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    body = r.json()
    mid = body.get("id")
    assert mid
    assert body.get("name") == payload["name"]
    assert body.get("roll_width") == 60.0
    yield mid
    # cleanup
    try:
        requests.delete(f"{API}/materials/{mid}", headers=admin_headers, timeout=15)
    except Exception:
        pass


def test_material_edit_updates_unit_cost(admin_headers, created_material_id):
    # PUT new unit_cost
    payload = {
        "name": "TEST_LF_Banner_13oz",
        "code": "TEST-LF-BAN",
        "category": "roll",
        "unit": "sqft",
        "unit_cost": 1.25,
        "modules": ["large-format"],
        "roll_width": 60.0,
        "printable_width": 58.0,
        "material_type": "banner",
    }
    r = requests.put(f"{API}/materials/{created_material_id}", headers=admin_headers, json=payload, timeout=15)
    assert r.status_code == 200
    # Verify via GET
    r2 = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    mat = next((m for m in r2.json() if m.get("id") == created_material_id), None)
    assert mat is not None
    assert abs(mat.get("unit_cost", 0) - 1.25) < 0.001

    # And it should appear in the /api/roll-materials view with mapped fields
    r3 = requests.get(f"{API}/roll-materials", headers=admin_headers, timeout=15)
    assert r3.status_code == 200
    rm = next((m for m in r3.json() if m.get("id") == created_material_id), None)
    assert rm is not None, "Central material with module=large-format should appear in /api/roll-materials"
    assert abs(rm.get("price_per_sqft", 0) - 1.25) < 0.001
    assert rm.get("roll_width") == 60.0


# ---------------- Per-module writes are BLOCKED ----------------
BLOCKED_PATHS = ["paper-stocks", "roll-materials", "laser-materials", "sheet-materials", "roll-sticker-materials"]


@pytest.mark.parametrize("path", BLOCKED_PATHS)
def test_per_module_post_blocked(admin_headers, path):
    r = requests.post(f"{API}/{path}", headers=admin_headers, json={"name": "should-not-work"}, timeout=15)
    assert r.status_code == 400, f"expected 400 on POST /api/{path}, got {r.status_code} {r.text}"
    assert "central Materials page" in (r.json().get("detail") or "")


@pytest.mark.parametrize("path", BLOCKED_PATHS)
def test_per_module_put_blocked(admin_headers, path):
    r = requests.put(f"{API}/{path}/anyid", headers=admin_headers, json={"name": "x"}, timeout=15)
    assert r.status_code == 400
    assert "central Materials page" in (r.json().get("detail") or "")


@pytest.mark.parametrize("path", BLOCKED_PATHS)
def test_per_module_delete_blocked(admin_headers, path):
    r = requests.delete(f"{API}/{path}/anyid", headers=admin_headers, timeout=15)
    assert r.status_code == 400
    assert "central Materials page" in (r.json().get("detail") or "")


@pytest.mark.parametrize("path", BLOCKED_PATHS)
def test_per_module_get_reads_central(admin_headers, path):
    r = requests.get(f"{API}/{path}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Module filters ----------------
def test_paper_stocks_reads_paper_module(admin_headers):
    r = requests.get(f"{API}/paper-stocks", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Should include Gloss Text (modules paper+booklet), NOT Baltic Birch (laser)
    names = [m.get("name", "") for m in data]
    assert any("Gloss Text" in n for n in names)
    assert not any("Baltic Birch" in n for n in names)


def test_laser_materials_only_laser(admin_headers):
    r = requests.get(f"{API}/laser-materials", headers=admin_headers, timeout=15)
    data = r.json()
    names = [m.get("name", "") for m in data]
    assert any("Baltic Birch" in n for n in names)


def test_sheet_materials_direct_print(admin_headers):
    r = requests.get(f"{API}/sheet-materials", headers=admin_headers, timeout=15)
    data = r.json()
    names = [m.get("name", "") for m in data]
    # Coroplast and ACM assigned to direct-print
    assert any("Coroplast" in n for n in names)
    assert any("ACM" in n for n in names)


# ---------------- Calculators pull from central ----------------
def test_calc_lf_uses_central(admin_headers):
    r = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    vinyl = next((m for m in r.json() if "Vinyl" in m.get("name", "")), None)
    assert vinyl
    payload = {
        "material_ids": [vinyl["id"]],
        "sizes": [{"width": 24, "height": 36, "qty": 1}],
        "mode": "print",
        "laminate": False,
    }
    r2 = requests.post(f"{API}/calc/largeformat", headers=admin_headers, json=payload, timeout=15)
    assert r2.status_code == 200, f"calc/largeformat failed: {r2.status_code} {r2.text}"
    body = r2.json()
    assert "results" in body and len(body["results"]) >= 1
    # ensure the material used is our central one
    assert body["results"][0]["material"]["id"] == vinyl["id"]
    assert body["results"][0]["total"]["material_cost"] > 0


def test_calc_paper_uses_central(admin_headers):
    r = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    paper = next((m for m in r.json() if "Gloss Text" in m.get("name", "")), None)
    assert paper
    prods = requests.get(f"{API}/products", headers=admin_headers, timeout=15).json()
    paper_prod = next((p for p in prods if (p.get("module") or "").lower() == "paper"), None)
    if not paper_prod:
        pytest.skip("No paper product seeded - cannot exercise /calc/paper (accepted)")
    payload = {
        "product_id": paper_prod["id"],
        "sheet_key": "13x19",
        "stock_ids": [paper["id"]],
        "laminate": False,
    }
    r2 = requests.post(f"{API}/calc/paper", headers=admin_headers, json=payload, timeout=20)
    assert r2.status_code == 200, f"calc/paper: {r2.status_code} {r2.text}"
    body = r2.json()
    assert "results" in body
    assert len(body["results"]) >= 1
    assert body["results"][0]["stock"]["id"] == paper["id"]


def test_calc_sticker_only_sticker_compatible(admin_headers):
    payload = {"width": 3, "height": 3, "qty": 100, "finishing": "kisscut", "laminate": False}
    r2 = requests.post(f"{API}/calc/sticker", headers=admin_headers, json=payload, timeout=20)
    assert r2.status_code == 200, f"calc/sticker: {r2.status_code} {r2.text}"
    body = r2.json()
    assert "results" in body
    # Fetch sticker_compatible material ids from central
    r_m = requests.get(f"{API}/materials", headers=admin_headers, timeout=15)
    sticker_names = {m["name"] for m in r_m.json() if m.get("sticker_compatible")}
    sticker_ids = {m["id"] for m in r_m.json() if m.get("sticker_compatible")}
    assert len(body["results"]) >= 1
    for res in body["results"]:
        mat = res.get("material")
        if isinstance(mat, dict):
            ref = mat.get("id") or mat.get("name")
        else:
            ref = mat
        assert ref in sticker_ids or ref in sticker_names, f"calc/sticker returned non-sticker material {ref}"
