"""Iteration 34 tests — Round Corners (Paper + Substrate) + Rush pricing settings.

Feature contract:
- Settings model exposes: rush_same_day_pct (default 15), rush_next_day_pct (default 10),
  rc_paper_pieces_per_stack (100), rc_paper_per_stack (8), rc_paper_min (0),
  rc_substrate_pieces_per_stack (1), rc_substrate_per_stack (2), rc_substrate_min (0).
- POST /api/calc/paper with round_corners=true returns per-row:
    round_corner_cost = max(rc_paper_min, ceil(qty/rc_paper_pieces_per_stack)*rc_paper_per_stack)
    round_corner_retail/wholesale = markup(rc_cost) then reduced by volume discount.
- Turning it OFF returns rc_cost==0.
- POST /api/calc/directprint with round_corners=true adds rc_cost using rc_substrate_*.
- PUT /api/settings persists rush + rc fields.
"""
import math
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"


def _login(email, pw):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def original_settings(admin):
    r = admin.get(f"{BASE_URL}/api/settings", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def default_product(admin):
    """Business Card 3.5x2 on 12x18 n_up=20."""
    r = admin.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    prods = r.json()
    for p in prods:
        if "business card" in (p.get("name", "").lower()):
            return p
    # fallback: first product
    return prods[0]


@pytest.fixture(scope="module")
def default_stock(admin):
    r = admin.get(f"{BASE_URL}/api/materials?category=paper", timeout=15)
    assert r.status_code == 200
    mats = r.json()
    for m in mats:
        if "100lb" in (m.get("name", "").lower()) and "uncoat" in (m.get("name", "").lower()):
            return m
    # any normal paper
    for m in mats:
        if (m.get("paper_type") or "normal") == "normal":
            return m
    pytest.skip("No paper stock available")


@pytest.fixture(scope="module")
def default_substrate(admin):
    r = admin.get(f"{BASE_URL}/api/materials?category=sheet", timeout=15)
    assert r.status_code == 200
    mats = r.json()
    # need a substrate with direct-print module (not paper/roll)
    for m in mats:
        if "direct-print" in (m.get("modules") or []):
            return m
    pytest.skip("No direct-print substrate available")


# ---------------- Settings ----------------
class TestSettingsFields:
    def test_settings_exposes_rush_and_rc_fields(self, original_settings):
        s = original_settings
        for f in [
            "rush_same_day_pct", "rush_next_day_pct",
            "rc_paper_pieces_per_stack", "rc_paper_per_stack", "rc_paper_min",
            "rc_substrate_pieces_per_stack", "rc_substrate_per_stack", "rc_substrate_min",
        ]:
            assert f in s, f"missing settings field: {f}"
        # defaults sanity
        assert float(s["rush_same_day_pct"]) > 0
        assert float(s["rush_next_day_pct"]) > 0

    def test_settings_put_persists_rush_next_day(self, admin, original_settings):
        old = float(original_settings["rush_next_day_pct"])
        new_val = 12.0 if old != 12.0 else 11.0
        try:
            r = admin.put(f"{BASE_URL}/api/settings", json={"rush_next_day_pct": new_val}, timeout=15)
            assert r.status_code == 200, r.text
            # verify via re-fetch
            r2 = admin.get(f"{BASE_URL}/api/settings", timeout=15)
            assert r2.status_code == 200
            assert float(r2.json()["rush_next_day_pct"]) == pytest.approx(new_val)
        finally:
            admin.put(f"{BASE_URL}/api/settings", json={"rush_next_day_pct": old}, timeout=15)

    def test_settings_put_persists_rc_paper_per_stack(self, admin, original_settings):
        old = float(original_settings["rc_paper_per_stack"])
        new_val = 9.5 if old != 9.5 else 7.0
        try:
            r = admin.put(f"{BASE_URL}/api/settings", json={"rc_paper_per_stack": new_val}, timeout=15)
            assert r.status_code == 200
            r2 = admin.get(f"{BASE_URL}/api/settings", timeout=15)
            assert float(r2.json()["rc_paper_per_stack"]) == pytest.approx(new_val)
        finally:
            admin.put(f"{BASE_URL}/api/settings", json={"rc_paper_per_stack": old}, timeout=15)


# ---------------- Round corners: PAPER ----------------
class TestRoundCornersPaper:
    def _rows(self, admin, product_id, stock_id, round_corners):
        r = admin.post(
            f"{BASE_URL}/api/calc/paper",
            json={
                "product_id": product_id,
                "sheet_key": "12x18",
                "laminate": False,
                "round_corners": round_corners,
                "stock_ids": [stock_id],
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["results"], "no results returned"
        return data["results"][0]["quote"]["rows"], data["qtys"]

    def test_round_corners_off_returns_zero(self, admin, default_product, default_stock, original_settings):
        rows, _ = self._rows(admin, default_product["id"], default_stock["id"], round_corners=False)
        for row in rows:
            assert row.get("round_corner_cost", 0) == 0
            # markup(0) is 0 in either formula
            if "round_corner_retail" in row:
                assert row["round_corner_retail"] == 0

    def test_round_corners_on_100pcs_cost_8(self, admin, default_product, default_stock, original_settings):
        pps = float(original_settings["rc_paper_pieces_per_stack"])
        per_stack = float(original_settings["rc_paper_per_stack"])
        rc_min = float(original_settings.get("rc_paper_min", 0) or 0)

        rows, qtys = self._rows(admin, default_product["id"], default_stock["id"], round_corners=True)
        by_qty = {int(r["qty"]): r for r in rows}

        # 100 pieces
        assert 100 in by_qty
        expected_100 = max(rc_min, round(math.ceil(100 / pps) * per_stack, 2))
        assert by_qty[100]["round_corner_cost"] == pytest.approx(expected_100), \
            f"qty=100 rc_cost expected {expected_100}, got {by_qty[100]['round_corner_cost']}"

        # 5000 pieces
        assert 5000 in by_qty
        expected_5000 = max(rc_min, round(math.ceil(5000 / pps) * per_stack, 2))
        assert by_qty[5000]["round_corner_cost"] == pytest.approx(expected_5000), \
            f"qty=5000 rc_cost expected {expected_5000}, got {by_qty[5000]['round_corner_cost']}"

        # with defaults: 100pcs -> $8, 5000pcs -> $400
        if pps == 100 and per_stack == 8 and rc_min == 0:
            assert by_qty[100]["round_corner_cost"] == 8.0
            assert by_qty[5000]["round_corner_cost"] == 400.0

    def test_round_corners_retail_wholesale_are_markup_of_cost(self, admin, default_product, default_stock, original_settings):
        rows, _ = self._rows(admin, default_product["id"], default_stock["id"], round_corners=True)
        settings = original_settings
        # Product-level override wins over settings default (server treats None/"" as unset, 0 as valid override)
        prod_r = default_product.get("retail_markup_pct")
        prod_w = default_product.get("wholesale_markup_pct")
        r_pct = float(prod_r) if prod_r not in (None, "") else float(settings["retail_markup_pct"])
        w_pct = float(prod_w) if prod_w not in (None, "") else float(settings["wholesale_markup_pct"])

        for row in rows:
            rc_cost = float(row["round_corner_cost"])
            rc_ret = float(row.get("round_corner_retail") or 0)
            rc_ws = float(row.get("round_corner_wholesale") or 0)
            # markup(cost, pct) = cost*(1+pct/100). Then possibly reduced by volume discount factor.
            base_ret = round(rc_cost * (1 + r_pct / 100), 2)
            base_ws = round(rc_cost * (1 + w_pct / 100), 2)
            vd = float(row.get("volume_discount_pct") or 0)
            f = 1 - vd / 100.0
            exp_ret = round(base_ret * f, 4)
            exp_ws = round(base_ws * f, 4)
            # small tolerance
            assert abs(rc_ret - exp_ret) < 0.02, f"qty={row['qty']}: retail {rc_ret} vs expected {exp_ret} (vd={vd})"
            assert abs(rc_ws - exp_ws) < 0.02, f"qty={row['qty']}: wholesale {rc_ws} vs expected {exp_ws} (vd={vd})"


# ---------------- Round corners: DIRECT PRINT (substrate) ----------------
class TestRoundCornersSubstrate:
    def test_direct_print_round_corners_qty1(self, admin, default_substrate, original_settings):
        s = original_settings
        pps = float(s["rc_substrate_pieces_per_stack"])
        per_stack = float(s["rc_substrate_per_stack"])
        rc_min = float(s.get("rc_substrate_min") or 0)

        payload_on = {
            "material_ids": [default_substrate["id"]],
            "sheet_size": "48x96",
            "sizes": [{"w": 24, "h": 36, "qty": 1, "label": "test"}],
            "round_corners": True,
        }
        r = admin.post(f"{BASE_URL}/api/calc/directprint", json=payload_on, timeout=30)
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        assert results, "empty results"
        first = results[0]
        expected = max(rc_min, round(math.ceil(1 / pps) * per_stack, 2))
        assert first["round_corner_cost"] == pytest.approx(expected), \
            f"expected rc {expected}, got {first['round_corner_cost']}"
        if pps == 1 and per_stack == 2 and rc_min == 0:
            assert first["round_corner_cost"] == 2.0

        # OFF -> 0
        payload_off = dict(payload_on)
        payload_off["round_corners"] = False
        r2 = admin.post(f"{BASE_URL}/api/calc/directprint", json=payload_off, timeout=30)
        assert r2.status_code == 200
        r2_first = r2.json()["results"][0]
        assert r2_first.get("round_corner_cost", 0) == 0

        # base_cost should differ by exactly rc delta
        assert first["base_cost"] == pytest.approx(r2_first["base_cost"] + expected, abs=0.02)


# ---------------- Regression: laminate + round corners ----------------
class TestLaminatePlusRoundCornersRegression:
    def test_calc_paper_laminate_and_rc_both_present(self, admin, default_product, default_stock):
        # Fetch a laminate material
        r = admin.get(f"{BASE_URL}/api/paper-addons?type=laminate", timeout=15)
        assert r.status_code == 200
        lams = r.json()
        lam_id = lams[0]["id"] if lams else None
        body = {
            "product_id": default_product["id"],
            "sheet_key": "12x18",
            "laminate": True,
            "laminate_id": lam_id,
            "laminate_sides": 2,
            "round_corners": True,
            "stock_ids": [default_stock["id"]],
        }
        rsp = admin.post(f"{BASE_URL}/api/calc/paper", json=body, timeout=30)
        assert rsp.status_code == 200, rsp.text
        rows = rsp.json()["results"][0]["quote"]["rows"]
        # Row for qty=500 (mid) should have both lamination>0 and rc>0
        target = next((r_ for r_ in rows if r_["qty"] == 500), rows[0])
        assert target["round_corner_cost"] > 0, "round_corner_cost should be > 0"
        # lamination may be 0 if lam material has no per_ft cost; skip if so
        # but the key point: response contains both fields, and order total sums them
        assert "lamination" in target
        assert "round_corner_retail" in target
