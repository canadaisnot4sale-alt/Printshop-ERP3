"""Backend tests for POST /api/calc/profitability (admin-only true manufacturing cost + margin)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@printandsave.ca", "admin123")


@pytest.fixture(scope="module")
def reseller_token():
    return _login("cliente1@test.com", "test123")


def test_profitability_basic_math(admin_token):
    r = requests.post(
        f"{API}/calc/profitability",
        json={"base_cost": 100, "quoted_price": 300, "production_hours": 1.5},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["shop_rate"] == 101.2
    assert d["labor_cost"] == 151.8
    assert d["true_manufacturing_cost"] == 251.8
    assert d["margin"] == 48.2
    assert d["below_cost"] is False


def test_profitability_below_cost(admin_token):
    r = requests.post(
        f"{API}/calc/profitability",
        json={"base_cost": 50, "quoted_price": 100, "production_hours": 5},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    d = r.json()
    # 5 * 101.2 = 506 + 50 = 556 true cost > 100
    assert d["below_cost"] is True
    assert d["margin"] < 0


def test_profitability_with_machine(admin_token):
    # get a machine
    m = requests.get(f"{API}/machines", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    if m.status_code != 200 or not m.json():
        pytest.skip("no machines available")
    mid = m.json()[0]["id"]
    r = requests.post(
        f"{API}/calc/profitability",
        json={"base_cost": 100, "quoted_price": 300, "production_hours": 1.5, "machine_id": mid},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    d = r.json()
    assert d["shop_rate"] >= 101.2
    assert d["machine_hourly"] >= 0
    # if machine has hourly, shop_rate should be higher
    if d["machine_hourly"] > 0:
        assert d["shop_rate"] > 101.2


def test_profitability_forbidden_for_reseller(reseller_token):
    r = requests.post(
        f"{API}/calc/profitability",
        json={"base_cost": 100, "quoted_price": 300, "production_hours": 1.5},
        headers={"Authorization": f"Bearer {reseller_token}"},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


def test_profitability_no_auth():
    r = requests.post(
        f"{API}/calc/profitability",
        json={"base_cost": 100, "quoted_price": 300, "production_hours": 1.5},
        timeout=15,
    )
    assert r.status_code in (401, 403)
