"""Test materials pricing: retail + wholesale (with overrides & markups)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://printshop-erp-3.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@printandsave.ca", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_materials_have_retail_and_wholesale(headers):
    r = requests.get(f"{BASE_URL}/api/materials", headers=headers)
    assert r.status_code == 200
    mats = r.json()
    assert len(mats) >= 2
    for m in mats:
        assert "selling_price" in m
        assert "wholesale_price" in m
    # Locate paper 100lb uncoated Cover
    paper = next((m for m in mats if "100lb" in (m.get("name") or "").lower() or
                  "uncoated" in (m.get("name") or "").lower()), None)
    assert paper is not None, f"Paper not found. Names: {[m.get('name') for m in mats]}"
    assert round(paper["selling_price"], 2) == 1.50
    assert round(paper["wholesale_price"], 2) == 1.00


def test_settings_markups_present(headers):
    r = requests.get(f"{BASE_URL}/api/settings", headers=headers)
    assert r.status_code == 200
    s = r.json()
    assert "retail_markup_pct" in s
    assert "wholesale_markup_pct" in s


def test_wholesale_override_works_and_reverts(headers):
    r = requests.get(f"{BASE_URL}/api/materials", headers=headers)
    mats = r.json()
    target = next((m for m in mats if round(m.get("wholesale_price", 0), 2) == 1.00), mats[0])
    mid = target["id"]

    # Set wholesale override (send full body merged)
    body = {**target, "wholesale_price_override": 0.90}
    up = requests.put(f"{BASE_URL}/api/materials/{mid}", json=body, headers=headers)
    assert up.status_code == 200, up.text
    got = requests.get(f"{BASE_URL}/api/materials", headers=headers).json()
    updated = next(m for m in got if m["id"] == mid)
    assert round(updated["wholesale_price"], 2) == 0.90

    # Revert
    body_revert = {**target, "wholesale_price_override": None}
    up2 = requests.put(f"{BASE_URL}/api/materials/{mid}", json=body_revert, headers=headers)
    assert up2.status_code == 200
    got2 = requests.get(f"{BASE_URL}/api/materials", headers=headers).json()
    reverted = next(m for m in got2 if m["id"] == mid)
    assert round(reverted["wholesale_price"], 2) == 1.00


def test_retail_markup_override_persists(headers):
    r = requests.get(f"{BASE_URL}/api/materials", headers=headers)
    mats = r.json()
    target = mats[0]
    mid = target["id"]
    original = target.get("retail_markup_pct")

    up = requests.put(f"{BASE_URL}/api/materials/{mid}",
                      json={**target, "retail_markup_pct": 100.0}, headers=headers)
    assert up.status_code == 200
    got = requests.get(f"{BASE_URL}/api/materials", headers=headers).json()
    updated = next(m for m in got if m["id"] == mid)
    # finish * 2 should equal wholesale (finish * 2 default)
    assert updated["selling_price"] == updated["wholesale_price"]

    # revert
    requests.put(f"{BASE_URL}/api/materials/{mid}",
                 json={**target, "retail_markup_pct": original}, headers=headers)


def test_inventory_value(headers):
    r = requests.get(f"{BASE_URL}/api/materials", headers=headers)
    mats = r.json()
    # Just report presence of stock/cost
    total = 0
    for m in mats:
        total += (m.get("stock_qty") or 0) * (m.get("cost_price") or m.get("cost") or 0)
    print(f"Inventory value approx: {total}")
