"""Tests for multi-module quote, quote->product, catalog-products RBAC (iteration 16)."""
import os, pytest, requests
from pathlib import Path

def _load_env():
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _load_env().rstrip("/") + "/api"
assert BASE.startswith("http"), f"Bad BASE: {BASE}"

def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin@printandsave.ca', 'admin123')}"}

@pytest.fixture(scope="module")
def reseller_h():
    return {"Authorization": f"Bearer {_login('cliente1@test.com', 'test123')}"}


# --- Config exposes product_categories ---
def test_config_product_categories(admin_h):
    r = requests.get(f"{BASE}/config", headers=admin_h, timeout=30)
    assert r.status_code == 200
    cats = r.json().get("product_categories")
    assert isinstance(cats, list)
    assert len(cats) == 14, f"expected 14 categories, got {len(cats)}"


# --- Multi-module quote save + list ---
def test_multi_quote_save_and_list(admin_h):
    payload = {
        "module": "Multi-Module",
        "title": "Combined quote · 2 item(s)",
        "quote_type": "multi",
        "summary": {"retail_total": 150.0},
        "items": [
            {"module": "Paper Printing", "title": "500 flyers", "price": 100, "qty": 1},
            {"module": "Large Format", "title": "Banner 3x6", "price": 50, "qty": 1},
        ],
        "customer_name": "TEST_multi_cust",
        "customer_email": "",
        "notes": "TEST"
    }
    r = requests.post(f"{BASE}/quotes", headers=admin_h, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    qid = r.json().get("id") or r.json().get("_id")
    # Now fetch list
    r2 = requests.get(f"{BASE}/quotes", headers=admin_h, timeout=30)
    assert r2.status_code == 200
    found = [q for q in r2.json() if q.get("module") == "Multi-Module" and q.get("customer_name") == "TEST_multi_cust"]
    assert found, "Saved multi-module quote not found in list"
    q = found[0]
    assert q.get("quote_type") == "multi"
    assert len(q.get("items") or []) == 2
    # cleanup
    requests.delete(f"{BASE}/quotes/{q['id']}", headers=admin_h, timeout=30)


# --- Catalog products CRUD (admin) ---
def test_catalog_product_admin_crud(admin_h):
    payload = {"name": "TEST_prod_1", "category": "Business Cards", "price": 25.0, "description": "t", "published": True}
    r = requests.post(f"{BASE}/catalog-products", headers=admin_h, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    # list
    r2 = requests.get(f"{BASE}/catalog-products", headers=admin_h, timeout=30)
    assert any(p["id"] == pid for p in r2.json())
    # update
    upd = {**payload, "price": 30.0, "published": False}
    r3 = requests.put(f"{BASE}/catalog-products/{pid}", headers=admin_h, json=upd, timeout=30)
    assert r3.status_code == 200
    assert r3.json()["price"] == 30.0
    # delete
    r4 = requests.delete(f"{BASE}/catalog-products/{pid}", headers=admin_h, timeout=30)
    assert r4.status_code == 200


# --- Reseller RBAC ---
def test_reseller_forbidden_on_catalog_writes(reseller_h):
    payload = {"name": "TEST_r_prod", "category": "Other", "price": 5}
    r = requests.post(f"{BASE}/catalog-products", headers=reseller_h, json=payload, timeout=30)
    assert r.status_code == 403


def test_reseller_only_sees_published(admin_h, reseller_h):
    # create a published + an unpublished product
    p1 = requests.post(f"{BASE}/catalog-products", headers=admin_h,
                       json={"name": "TEST_pub", "category": "Other", "price": 1, "published": True}, timeout=30).json()
    p2 = requests.post(f"{BASE}/catalog-products", headers=admin_h,
                       json={"name": "TEST_unpub", "category": "Other", "price": 1, "published": False}, timeout=30).json()
    lst = requests.get(f"{BASE}/catalog-products", headers=reseller_h, timeout=30).json()
    names = [p["name"] for p in lst]
    assert "TEST_pub" in names
    assert "TEST_unpub" not in names
    # admin sees both
    admin_lst = requests.get(f"{BASE}/catalog-products", headers=admin_h, timeout=30).json()
    admin_names = [p["name"] for p in admin_lst]
    assert "TEST_pub" in admin_names and "TEST_unpub" in admin_names
    # cleanup
    for p in (p1, p2):
        requests.delete(f"{BASE}/catalog-products/{p['id']}", headers=admin_h, timeout=30)


def test_quote_to_product_rbac(admin_h, reseller_h):
    # Create a quote as admin first
    payload = {"module": "Paper Printing", "title": "TEST_q", "summary": {"retail_total": 99.0}, "inputs": {}}
    q = requests.post(f"{BASE}/quotes", headers=admin_h, json=payload, timeout=30).json()
    qid = q["id"]
    # reseller forbidden
    body = {"name": "TEST_q_prod", "category": "Other", "price": 99, "published": False}
    r = requests.post(f"{BASE}/quotes/{qid}/to-product", headers=reseller_h, json=body, timeout=30)
    assert r.status_code == 403
    # admin ok
    r2 = requests.post(f"{BASE}/quotes/{qid}/to-product", headers=admin_h, json=body, timeout=30)
    assert r2.status_code in (200, 201), r2.text
    prod = r2.json()
    assert prod["source_quote_id"] == qid
    assert prod["module"] == "Paper Printing"
    # cleanup
    requests.delete(f"{BASE}/catalog-products/{prod['id']}", headers=admin_h, timeout=30)
    requests.delete(f"{BASE}/quotes/{qid}", headers=admin_h, timeout=30)
