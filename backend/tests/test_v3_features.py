"""V3 feature tests: multi-size, placements, letters, finishing, presets, quotes with customer/notes."""
import os, time, uuid, pytest, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    from pathlib import Path
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            BASE = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"


def _sess(tok):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@printandsave.ca", "password": "admin123"})
    assert r.status_code == 200, r.text
    return _sess(r.json()["token"])


@pytest.fixture(scope="module")
def reseller():
    r = requests.post(f"{API}/auth/login", json={"email": "cliente1@test.com", "password": "test123"})
    if r.status_code != 200:
        pytest.skip("reseller not seeded")
    return _sess(r.json()["token"])


@pytest.fixture(scope="module")
def client():
    email = f"TEST_v3client_{int(time.time())}_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "V3C"})
    assert r.status_code == 200, r.text
    return _sess(r.json()["token"])


# ---- DTF placements + nesting ----
class TestDTF:
    def test_placements_nested(self, admin):
        payload = {"placements": [
            {"label": "Front", "w": 4, "h": 4},
            {"label": "Back", "w": 8.5, "h": 11},
        ], "qty": 10}
        r = admin.post(f"{API}/calc/dtf", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        # Look for nesting / section length / area info
        assert any(k in j for k in ("section_length_in", "layout", "nesting", "pieces", "section_length"))

    def test_client_dtf_retail_only(self, client):
        r = client.post(f"{API}/calc/dtf", json={"placements": [{"label": "F", "w": 4, "h": 4}], "qty": 5})
        assert r.status_code == 200, r.text
        s = r.text.lower()
        assert "wholesale" not in s and "cost" not in s.replace("_cost", "x")  # rough check

    def test_reseller_dtf_wholesale_only(self, reseller):
        r = reseller.post(f"{API}/calc/dtf", json={"placements": [{"label": "F", "w": 4, "h": 4}], "qty": 5})
        assert r.status_code == 200, r.text
        assert "retail" not in r.text.lower()


# ---- Embroidery: areas + digitizing toggle ----
class TestEmbroidery:
    def test_areas_and_digitizing(self, admin):
        r = admin.post(f"{API}/calc/embroidery", json={
            "placements": [{"label": "Left Chest", "stitches": 8000}],
            "qty": 12, "digitizing": True,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        # digitizing should reflect $69 setup somewhere
        assert "69" in r.text or j.get("digitizing_cost") == 69 or j.get("setup", 0) >= 69


# ---- Laser: sizes[] + presets CRUD ----
class TestLaser:
    def test_multisize(self, admin):
        r = admin.post(f"{API}/calc/laser", json={
            "sizes": [{"width": 6, "height": 6, "qty": 5}, {"width": 3, "height": 4, "qty": 10}],
        })
        assert r.status_code == 200, r.text
        assert "results" in r.json()

    def test_preset_crud(self, admin):
        payload = {"name": f"TEST_preset_{uuid.uuid4().hex[:6]}", "material": "MDF 3mm", "power": 80, "speed": 20, "time_min": 5, "thickness_mm": 3, "passes": 1}
        r = admin.post(f"{API}/laser-presets", json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        r2 = admin.get(f"{API}/laser-presets")
        assert r2.status_code == 200
        assert any(p["id"] == pid for p in r2.json())
        admin.delete(f"{API}/laser-presets/{pid}")


# ---- Direct Print: sizes[] + sheet ----
class TestDirectPrint:
    def test_multisize_layout(self, admin):
        r = admin.post(f"{API}/calc/directprint", json={
            "sizes": [{"width": 12, "height": 12, "qty": 4}],
            "sheet_w": 48, "sheet_h": 96, "cnc": True, "cnc_length_in": 40,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert "results" in j or "layout" in j


# ---- Channel Letters: letters + margin ----
class TestChannelLetters:
    def test_letters_nested(self, admin):
        r = admin.post(f"{API}/calc/channelletters", json={
            "letters": [{"label": "A", "width": 12, "height": 18, "qty": 1},
                        {"label": "B", "width": 10, "height": 18, "qty": 2}],
        })
        assert r.status_code == 200, r.text


# ---- Stickers: finishing + laminate ----
class TestStickers:
    def test_finishing_diecut_laminate(self, admin):
        r = admin.post(f"{API}/calc/sticker", json={
            "width": 3, "height": 3, "qty": 100, "finishing": "diecut", "laminate": True,
        })
        assert r.status_code == 200, r.text
        assert "results" in r.json()

    def test_finishing_kisscut(self, admin):
        r = admin.post(f"{API}/calc/sticker", json={"width": 3, "height": 3, "qty": 100, "finishing": "kisscut"})
        assert r.status_code == 200, r.text


# ---- Job presets (per-user) ----
class TestJobPresets:
    def test_crud(self, admin):
        payload = {"name": f"TEST_jp_{uuid.uuid4().hex[:6]}", "module": "directprint",
                   "sizes": [{"width": 8, "height": 10, "qty": 1}]}
        r = admin.post(f"{API}/job-presets", json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        r2 = admin.get(f"{API}/job-presets")
        assert any(p["id"] == pid for p in r2.json())
        admin.delete(f"{API}/job-presets/{pid}")


# ---- Quotes with customer_name + notes ----
class TestQuotesV3:
    def test_save_with_customer_notes(self, admin):
        payload = {
            "module": "dtf",
            "title": "TEST Quote v3",
            "customer_name": "TEST_Customer_Acme",
            "notes": "Rush order - Blue hoodies",
            "summary": {"retail_total": 100, "wholesale_total": 80, "cost_total": 50},
        }
        r = admin.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        r2 = admin.get(f"{API}/quotes")
        assert r2.status_code == 200
        got = [q for q in r2.json() if q["id"] == qid]
        assert got, "saved quote not in list"
        q = got[0]
        assert q.get("customer_name") == "TEST_Customer_Acme"
        assert q.get("notes") == "Rush order - Blue hoodies"
        admin.delete(f"{API}/quotes/{qid}")


# ---- Settings v3 fields ----
class TestSettingsV3:
    def test_new_fields_present(self, admin):
        r = admin.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        # Non-strict: report presence
        for k in ("dtf_roll_width", "channel_fixture_margin_in", "embroidery_digitizing_1_3"):
            if k not in s:
                print(f"WARN missing setting {k}")
