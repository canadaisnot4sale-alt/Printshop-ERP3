"""Per-module Volume Discount tests.
Verifies:
  * GET /api/settings returns volume_discounts_by_module.
  * Setting DTF custom tiers only affects /api/calc/dtf; paper/stickers use default.
  * Modules without custom tiers fall back to default.
  * RBAC still applies.
Always restores original volume_discounts_by_module in teardown.
"""
import os, copy, pytest, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    from pathlib import Path
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            BASE = ln.split("=", 1)[1].strip().rstrip("/")
            break
API = f"{BASE}/api"

DEFAULT_TIERS = [
    {"qty": 25, "pct": 0}, {"qty": 50, "pct": 2}, {"qty": 100, "pct": 5},
    {"qty": 250, "pct": 9}, {"qty": 500, "pct": 13}, {"qty": 1000, "pct": 18},
    {"qty": 2500, "pct": 23}, {"qty": 5000, "pct": 28},
]
DTF_CUSTOM = [
    {"qty": 1, "pct": 0}, {"qty": 6, "pct": 3}, {"qty": 12, "pct": 6},
    {"qty": 24, "pct": 10}, {"qty": 50, "pct": 15}, {"qty": 100, "pct": 22},
]


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
def per_module_setup(admin):
    """Save original map, install DTF custom + Default, restore at the end."""
    cur = admin.get(f"{API}/settings").json()
    original_map = copy.deepcopy(cur.get("volume_discounts_by_module"))
    payload = dict(cur)
    payload["volume_discounts_by_module"] = {
        "default": copy.deepcopy(DEFAULT_TIERS),
        "dtf": copy.deepcopy(DTF_CUSTOM),
    }
    r = admin.put(f"{API}/settings", json=payload)
    assert r.status_code == 200, r.text
    yield
    payload = dict(admin.get(f"{API}/settings").json())
    payload["volume_discounts_by_module"] = original_map or {"default": copy.deepcopy(DEFAULT_TIERS)}
    r = admin.put(f"{API}/settings", json=payload)
    assert r.status_code == 200


pytestmark = pytest.mark.xdist_group("volume_discount_settings")


class TestSettingsSchema:
    def test_settings_has_map(self, admin):
        j = admin.get(f"{API}/settings").json()
        assert "volume_discounts_by_module" in j, "settings missing volume_discounts_by_module"
        assert isinstance(j["volume_discounts_by_module"], dict)
        # Default should be present
        assert "default" in j["volume_discounts_by_module"]

    def test_persist_map_roundtrip(self, admin):
        cur = admin.get(f"{API}/settings").json()
        orig = copy.deepcopy(cur.get("volume_discounts_by_module"))
        try:
            payload = dict(cur)
            payload["volume_discounts_by_module"] = {
                "default": copy.deepcopy(DEFAULT_TIERS),
                "dtf": [{"qty": 10, "pct": 7}, {"qty": 100, "pct": 20}],
            }
            r = admin.put(f"{API}/settings", json=payload)
            assert r.status_code == 200, r.text
            m = r.json()["volume_discounts_by_module"]
            assert "dtf" in m
            got = {int(t["qty"]): float(t["pct"]) for t in m["dtf"]}
            assert got == {10: 7.0, 100: 20.0}
        finally:
            p = dict(admin.get(f"{API}/settings").json())
            p["volume_discounts_by_module"] = orig
            admin.put(f"{API}/settings", json=p)


class TestDTFCustomTiers:
    def test_dtf_qty12_gets_6pct(self, admin, per_module_setup):
        r = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 12,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("volume_discount_pct") == 6, f"expected 6% @12, got {j.get('volume_discount_pct')}"

    def test_dtf_qty24_gets_10pct(self, admin, per_module_setup):
        r = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 24,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("volume_discount_pct") == 10

    def test_dtf_qty100_gets_22pct(self, admin, per_module_setup):
        r = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 100,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("volume_discount_pct") == 22

    def test_dtf_qty6_gets_3pct(self, admin, per_module_setup):
        r = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 6,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("volume_discount_pct") == 3

    def test_dtf_qty5_gets_0pct(self, admin, per_module_setup):
        """qty=5 is below the smallest DTF tier (1) except the 0% one, so should be 0%.
        Also verifies default tiers (25=0) are NOT leaking in."""
        r = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 5,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("volume_discount_pct") == 0


class TestOtherModulesUseDefault:
    """Modules without custom tiers must keep using Default tiers."""

    def _first_paper_product(self, admin):
        prods = admin.get(f"{API}/products").json()
        return prods[0] if prods else None

    def _paper_stocks(self, admin):
        return [m for m in admin.get(f"{API}/materials").json()
                if (m.get("category") or "").lower() == "paper"]

    def test_paper_qty100_uses_default_5pct(self, admin, per_module_setup):
        product = self._first_paper_product(admin)
        stocks = self._paper_stocks(admin)
        if not product or not stocks:
            pytest.skip("paper seed missing")
        r = admin.post(f"{API}/calc/paper", json={
            "product_id": product["id"], "sheet_key": "12x18",
            "stock_ids": [stocks[0]["id"]],
        })
        assert r.status_code == 200, r.text
        rows = r.json()["results"][0]["quote"]["rows"]
        by_q = {row["qty"]: row for row in rows}
        # Default has qty=100→5%
        assert by_q[100]["volume_discount_pct"] == 5, f"paper@100 should be 5%, got {by_q[100]['volume_discount_pct']}"
        # And qty=500→13% (default), not the custom dtf tiers
        assert by_q[500]["volume_discount_pct"] == 13

    def test_embroidery_qty100_uses_default_5pct(self, admin, per_module_setup):
        r = admin.post(f"{API}/calc/embroidery", json={
            "placements": [{"label": "LC", "stitch_count": 8000}], "quantity": 100, "digitizing": False,
        })
        assert r.status_code == 200, r.text
        assert r.json().get("volume_discount_pct") == 5

    def test_rollsticker_qty500_uses_default_13pct(self, admin, per_module_setup):
        mats = admin.get(f"{API}/materials").json()
        rolls = [m for m in mats if (m.get("category") or "").lower() == "roll"]
        if not rolls:
            pytest.skip("no roll materials seeded")
        r = admin.post(f"{API}/calc/rollsticker", json={"material_id": rolls[0]["id"], "quantity": 500})
        assert r.status_code == 200, r.text
        # scrub-walk find pct
        found = []
        def walk(o):
            if isinstance(o, dict):
                if "volume_discount_pct" in o: found.append(o["volume_discount_pct"])
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for x in o: walk(x)
        walk(r.json())
        assert 13 in found, f"expected 13 in {found}"


class TestDTFvsDefaultDivergence:
    """Directly verifies isolation: at qty=100, DTF=22% but Paper/Embroidery=5%."""
    def test_dtf_and_paper_diverge_at_100(self, admin, per_module_setup):
        d = admin.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 100,
        }).json()
        e = admin.post(f"{API}/calc/embroidery", json={
            "placements": [{"label": "LC", "stitch_count": 8000}], "quantity": 100, "digitizing": False,
        }).json()
        assert d.get("volume_discount_pct") == 22
        assert e.get("volume_discount_pct") == 5


class TestRBACPerModule:
    def test_client_dtf_gets_discount_no_wholesale(self, admin, per_module_setup):
        import time, uuid
        email = f"TEST_vdpm_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "VD"})
        assert r.status_code == 200
        client = _sess(r.json()["token"])
        rr = client.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 24,
        })
        assert rr.status_code == 200, rr.text
        j = rr.json()
        assert j.get("volume_discount_pct") == 10
        assert "wholesale" not in rr.text.lower()

    def test_reseller_dtf_gets_discount_no_retail(self, admin, per_module_setup):
        r = requests.post(f"{API}/auth/login", json={"email": "cliente1@test.com", "password": "test123"})
        if r.status_code != 200:
            pytest.skip("reseller not seeded")
        reseller = _sess(r.json()["token"])
        rr = reseller.post(f"{API}/calc/dtf", json={
            "placements": [{"label": "F", "w": 4, "h": 4}], "quantity": 24,
        })
        assert rr.status_code == 200, rr.text
        j = rr.json()
        assert j.get("volume_discount_pct") == 10
        low = rr.text.lower()
        assert "customer_price" not in low
        assert "retail_" not in low
