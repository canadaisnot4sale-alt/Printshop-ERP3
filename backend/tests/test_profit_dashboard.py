import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_admin_profit_dashboard_ok():
    s = _login("admin@printandsave.ca", "admin123")
    r = s.get(f"{BASE_URL}/api/finance/profit-dashboard?months=6")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "monthly_overhead" in d
    assert "series" in d and isinstance(d["series"], list) and len(d["series"]) >= 1
    assert "current" in d
    row = d["series"][-1]
    for k in ("month", "revenue", "total_cost", "net_profit"):
        assert k in row, f"missing {k} in {row}"


def test_admin_profit_dashboard_12_months():
    s = _login("admin@printandsave.ca", "admin123")
    r = s.get(f"{BASE_URL}/api/finance/profit-dashboard?months=12")
    assert r.status_code == 200
    assert len(r.json()["series"]) >= 6


def test_reseller_forbidden():
    s = _login("cliente1@test.com", "test123")
    r = s.get(f"{BASE_URL}/api/finance/profit-dashboard?months=6")
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
