"""Backend tests for Machine Maintenance & Service Log feature."""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def machine_id(headers):
    r = requests.get(f"{API}/machines", headers=headers, timeout=30)
    assert r.status_code == 200
    machines = r.json()
    if not machines:
        # Create a machine
        r = requests.post(f"{API}/machines", headers=headers, json={
            "name": "TEST_Machine_Maint",
            "value": 10000, "life_years": 5, "maintenance_pct_year": 2.0,
            "hourly_rate": 20, "ink_cost_per_sqft": 0.5, "ink_included_pct": 0
        }, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"]
    return machines[0]["id"]


created_logs = []
created_scheds = []


def test_login_and_settings_technician_rate(headers):
    r = requests.get(f"{API}/settings", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "technician_hourly_rate" in data
    assert isinstance(data["technician_hourly_rate"], (int, float))


def test_invoice_upload_and_download(headers):
    files = {"file": ("test_invoice.pdf", io.BytesIO(b"%PDF-1.4 fake content"), "application/pdf")}
    r = requests.post(f"{API}/upload/invoice",
                      headers={"Authorization": headers["Authorization"]},
                      files=files, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "file_id" in data
    file_id = data["file_id"]
    # Download via Bearer
    r2 = requests.get(f"{API}/files/{file_id}/download", headers=headers, timeout=60)
    assert r2.status_code == 200
    assert len(r2.content) > 0
    # Download via ?auth=
    r3 = requests.get(f"{API}/files/{file_id}/download?auth={headers['Authorization'].split(' ',1)[1]}", timeout=60)
    assert r3.status_code == 200


def test_create_part_log(headers, machine_id):
    payload = {
        "machine_id": machine_id, "type": "part", "title": "TEST_Part_Roller",
        "supplier": "TestSupplier", "part_number": "P-001",
        "cost": 420.0, "date": "2026-01-10"
    }
    r = requests.post(f"{API}/machines/{machine_id}/logs", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    log = r.json()
    assert log["cost"] == 420.0
    assert log["type"] == "part"
    created_logs.append(log["id"])
    # List
    r = requests.get(f"{API}/machines/{machine_id}/logs", headers=headers, timeout=30)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert log["id"] in ids


def test_create_cleaning_log(headers, machine_id):
    payload = {
        "machine_id": machine_id, "type": "cleaning", "title": "TEST_Cleaning",
        "cleaning_minutes": 30, "cleaning_rate": 65,
        "cost": 0.0, "date": "2026-01-10"
    }
    r = requests.post(f"{API}/machines/{machine_id}/logs", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    log = r.json()
    assert log["total"] == 32.5
    created_logs.append(log["id"])


def test_create_recurring_schedule(headers, machine_id):
    payload = {
        "machine_id": machine_id, "part_name": "TEST_Filter",
        "recurring": True, "interval_months": 3,
        "last_done": "2026-01-01"
    }
    r = requests.post(f"{API}/machines/{machine_id}/schedules", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    sch = r.json()
    assert sch.get("computed_next_due")
    assert sch.get("status") == "overdue"
    created_scheds.append(sch["id"])


def test_alerts_endpoint(headers):
    r = requests.get(f"{API}/machines/maintenance/alerts", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "count" in data or "alerts" in data


def test_tax_report(headers):
    r = requests.get(f"{API}/machines/maintenance/tax-report?year=2026", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "grand_total" in data
    # Should include our created 420 + 32.5 = 452.5
    assert data["grand_total"] >= 452.5 - 0.01


def test_equipment_route_removed():
    # /equipment page: this is a frontend route; backend has no /api/equipment
    r = requests.get(f"{API}/equipment", timeout=15)
    assert r.status_code in (401, 404, 405)


def test_zzz_cleanup(headers, machine_id):
    for lid in created_logs:
        requests.delete(f"{API}/machine-logs/{lid}", headers=headers, timeout=30)
    for sid in created_scheds:
        requests.delete(f"{API}/machine-schedules/{sid}", headers=headers, timeout=30)
