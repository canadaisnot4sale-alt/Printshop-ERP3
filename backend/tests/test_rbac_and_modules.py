"""RBAC + new module backend tests for Print and Save ERP.

Covers:
- Admin / Reseller / Client login + role in /auth/me
- Self-registration defaults to 'client'
- Field-level price scrubbing on all calculators
- Admin-only write gate (POST /paper-stocks -> 403 for non-admin)
- Admin-only routes: /users, /calc/equipment
- 5 new calc endpoints: dtf, embroidery, laser, directprint, channelletters
- Save Quote CRUD
"""
import os
import time
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN = ("admin@printandsave.ca", "admin123")
RESELLER = ("cliente1@test.com", "test123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    return r.json()["token"]


def _sess(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_sess():
    tok = _login(*ADMIN)
    assert tok, "Admin login failed"
    return _sess(tok)


@pytest.fixture(scope="module")
def reseller_sess():
    tok = _login(*RESELLER)
    if not tok:
        pytest.skip("Reseller test account not seeded")
    return _sess(tok)


@pytest.fixture(scope="module")
def client_user():
    """Create a fresh client via self-registration."""
    email = f"TEST_client_{int(time.time())}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "TEST Client"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "client", f"Register default role should be client, got {data['user']['role']}"
    s = _sess(data["token"])
    return s, data["user"]


# ---------- Auth / Role verification ----------
class TestRoles:
    def test_admin_role(self, admin_sess):
        r = admin_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_reseller_role(self, reseller_sess):
        r = reseller_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "reseller"

    def test_client_default_role(self, client_user):
        s, u = client_user
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "client"


# ---------- Admin-only write / read gates ----------
class TestAdminGates:
    PAYLOAD = {"name": "TEST_RBAC_Stock", "size": "13x19", "sheets_per_box": 500, "cost_per_box": 100.0}

    def test_client_cannot_post_paper_stock(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/paper-stocks", json=self.PAYLOAD)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_reseller_cannot_post_paper_stock(self, reseller_sess):
        r = reseller_sess.post(f"{API}/paper-stocks", json=self.PAYLOAD)
        assert r.status_code == 403

    def test_client_cannot_list_users(self, client_user):
        s, _ = client_user
        r = s.get(f"{API}/users")
        assert r.status_code == 403

    def test_reseller_cannot_list_users(self, reseller_sess):
        r = reseller_sess.get(f"{API}/users")
        assert r.status_code == 403

    def test_admin_can_list_users(self, admin_sess):
        r = admin_sess.get(f"{API}/users")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_client_cannot_write_settings(self, client_user):
        s, _ = client_user
        r = s.put(f"{API}/settings", json={"retail_markup_pct": 100})
        assert r.status_code == 403

    def test_client_cannot_call_calc_equipment(self, admin_sess, client_user):
        eqs = admin_sess.get(f"{API}/equipment").json()
        if not eqs:
            pytest.skip("no equipment")
        s, _ = client_user
        r = s.get(f"{API}/calc/equipment/{eqs[0]['id']}")
        assert r.status_code == 403


# ---------- Field-level scrubbing on calculators ----------
COST_KEYS = {"material_cost", "printing_cost", "extra_cost", "cover_cost", "inside_cost",
             "print_cost", "binding_cost", "total_cost", "dtf_cost", "garment_cost", "labor",
             "embroidery_cost", "setup", "cut_cost", "engrave_cost", "cnc_cost",
             "face_cost", "return_cost", "sheet_cost", "base_cost"}
RETAIL_KEYS = {"customer_price", "customer_price_4_0", "customer_price_4_4",
               "selling_price", "unit_price", "retail_total"}
WHOLESALE_KEYS = {"wholesale_price", "wholesale_price_4_0", "wholesale_price_4_4",
                  "wholesale_total", "wholesale_unit"}


def _keys_deep(obj, acc=None):
    if acc is None:
        acc = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            acc.add(k)
            _keys_deep(v, acc)
    elif isinstance(obj, list):
        for i in obj:
            _keys_deep(i, acc)
    return acc


class TestScrubDTF:
    body = {"garment_id": None, "print_width": 10, "print_height": 12, "quantity": 12}

    def test_admin_sees_all(self, admin_sess):
        r = admin_sess.post(f"{API}/calc/dtf", json=self.body)
        assert r.status_code == 200
        keys = _keys_deep(r.json())
        assert "dtf_cost" in keys and "retail_total" in keys and "wholesale_total" in keys

    def test_client_retail_only(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/dtf", json=self.body)
        assert r.status_code == 200
        keys = _keys_deep(r.json())
        assert keys.isdisjoint(COST_KEYS), f"client leaked cost keys: {keys & COST_KEYS}"
        assert keys.isdisjoint(WHOLESALE_KEYS), f"client leaked wholesale keys: {keys & WHOLESALE_KEYS}"
        assert "retail_total" in keys and "unit_price" in keys

    def test_reseller_wholesale_only(self, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/dtf", json=self.body)
        assert r.status_code == 200
        keys = _keys_deep(r.json())
        assert keys.isdisjoint(COST_KEYS)
        assert keys.isdisjoint(RETAIL_KEYS)
        assert "wholesale_total" in keys and "wholesale_unit" in keys


class TestScrubEmbroidery:
    body = {"garment_id": None, "stitch_count": 8000, "quantity": 12}

    def test_client(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/embroidery", json=self.body)
        assert r.status_code == 200
        keys = _keys_deep(r.json())
        assert keys.isdisjoint(COST_KEYS)
        assert keys.isdisjoint(WHOLESALE_KEYS)
        assert "retail_total" in keys

    def test_reseller(self, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/embroidery", json=self.body)
        keys = _keys_deep(r.json())
        assert keys.isdisjoint(RETAIL_KEYS)
        assert "wholesale_total" in keys


class TestScrubLaser:
    body = {"piece_width": 6, "piece_height": 6, "cut_length_in": 24, "engrave_area_sqin": 4, "quantity": 10}

    def test_admin(self, admin_sess):
        r = admin_sess.post(f"{API}/calc/laser", json=self.body)
        assert r.status_code == 200
        j = r.json()
        assert "results" in j
        if j["results"]:
            keys = _keys_deep(j["results"])
            assert "sheet_cost" in keys and "retail_total" in keys

    def test_client(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/laser", json=self.body)
        assert r.status_code == 200
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(COST_KEYS)
            assert k.isdisjoint(WHOLESALE_KEYS)
            assert "retail_total" in k

    def test_reseller(self, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/laser", json=self.body)
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(RETAIL_KEYS)
            assert "wholesale_total" in k


class TestScrubDirectPrint:
    body = {"sheet_size": "4x8", "piece_width": 24, "piece_height": 18, "quantity": 4, "cnc": False}

    def test_admin(self, admin_sess):
        r = admin_sess.post(f"{API}/calc/directprint", json=self.body)
        assert r.status_code == 200
        j = r.json()
        if j["results"]:
            keys = _keys_deep(j["results"])
            assert "sheet_cost" in keys and "retail_total" in keys

    def test_client(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/directprint", json=self.body)
        assert r.status_code == 200
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(COST_KEYS)
            assert k.isdisjoint(WHOLESALE_KEYS)

    def test_reseller(self, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/directprint", json=self.body)
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(RETAIL_KEYS)


class TestScrubChannelLetters:
    body = {"sheet_size": "4x8", "letter_height": 24, "quantity": 10}

    def test_admin(self, admin_sess):
        r = admin_sess.post(f"{API}/calc/channelletters", json=self.body)
        assert r.status_code == 200
        j = r.json()
        if j["results"]:
            k = _keys_deep(j["results"])
            assert "face_cost" in k and "retail_total" in k and "wholesale_total" in k

    def test_client(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/channelletters", json=self.body)
        assert r.status_code == 200
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(COST_KEYS)
            assert k.isdisjoint(WHOLESALE_KEYS)

    def test_reseller(self, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/channelletters", json=self.body)
        for res in r.json()["results"]:
            k = _keys_deep(res)
            assert k.isdisjoint(RETAIL_KEYS)


# ---------- Existing calc scrubbing (paper) ----------
class TestScrubPaper:
    def _payload(self, admin_sess):
        products = admin_sess.get(f"{API}/products").json()
        return {"product_id": products[0]["id"], "sheet_key": "13x19"}

    def test_client_paper(self, admin_sess, client_user):
        s, _ = client_user
        r = s.post(f"{API}/calc/paper", json=self._payload(admin_sess))
        assert r.status_code == 200
        for res in r.json()["results"]:
            k = _keys_deep(res["quote"])
            assert k.isdisjoint(COST_KEYS)
            assert k.isdisjoint(WHOLESALE_KEYS)

    def test_reseller_paper(self, admin_sess, reseller_sess):
        r = reseller_sess.post(f"{API}/calc/paper", json=self._payload(admin_sess))
        for res in r.json()["results"]:
            k = _keys_deep(res["quote"])
            assert k.isdisjoint(RETAIL_KEYS)


# ---------- User management ----------
class TestUserManagement:
    def test_admin_change_role(self, admin_sess, client_user):
        _, u = client_user
        r = admin_sess.put(f"{API}/users/{u['id']}/role", json={"role": "reseller"})
        assert r.status_code == 200
        assert r.json()["role"] == "reseller"
        # revert
        admin_sess.put(f"{API}/users/{u['id']}/role", json={"role": "client"})

    def test_admin_cannot_demote_self(self, admin_sess):
        me = admin_sess.get(f"{API}/auth/me").json()
        r = admin_sess.put(f"{API}/users/{me['id']}/role", json={"role": "client"})
        assert r.status_code == 400

    def test_admin_cannot_delete_self(self, admin_sess):
        me = admin_sess.get(f"{API}/auth/me").json()
        r = admin_sess.delete(f"{API}/users/{me['id']}")
        assert r.status_code == 400


# ---------- Save Quote flow ----------
class TestQuotes:
    def test_client_save_and_list(self, client_user):
        s, _ = client_user
        r = s.post(f"{API}/quotes", json={"module": "DTF", "title": "TEST_Quote", "summary": {"retail_total": 100}})
        assert r.status_code == 200
        qid = r.json()["id"]
        listed = s.get(f"{API}/quotes").json()
        assert any(q["id"] == qid for q in listed)
        # delete
        d = s.delete(f"{API}/quotes/{qid}")
        assert d.status_code == 200
        # cleanup verification
        remaining = s.get(f"{API}/quotes").json()
        assert not any(q["id"] == qid for q in remaining)


# ---------- Config ----------
class TestConfig:
    def test_config_role_field(self, admin_sess, client_user):
        assert admin_sess.get(f"{API}/config").json()["role"] == "admin"
        s, _ = client_user
        assert s.get(f"{API}/config").json()["role"] == "client"
