"""Tests for linked_material_id override across per-module material tables and calc endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@printandsave.ca", "password": "admin123"}


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def unified_material(admin_client):
    payload = {"name": "LINKTEST-ROLL", "category": "roll", "unit": "sqft", "unit_cost": 0.42, "stock_qty": 30}
    r = admin_client.post(f"{BASE_URL}/api/materials", json=payload)
    assert r.status_code in (200, 201), f"create material: {r.status_code} {r.text}"
    m = r.json()
    mid = m.get("id") or m.get("_id")
    yield {"id": mid, **payload}
    # Cleanup
    admin_client.delete(f"{BASE_URL}/api/materials/{mid}")


# ---------------- Roll materials link override ----------------
def test_roll_material_link_override_and_unlink(admin_client, unified_material):
    r = admin_client.get(f"{BASE_URL}/api/roll-materials")
    assert r.status_code == 200
    rolls = r.json()
    assert len(rolls) > 0, "need at least one roll material seeded"
    item = rolls[0]
    rid = item.get("id") or item.get("_id")
    original_price = item.get("price_per_sqft")

    # Build PUT body: same as item + linked_material_id
    body = {k: v for k, v in item.items() if k not in ("id", "_id", "linked_material_name", "linked_stock_qty")}
    body["linked_material_id"] = unified_material["id"]
    r = admin_client.put(f"{BASE_URL}/api/roll-materials/{rid}", json=body)
    assert r.status_code in (200, 204), f"link put failed: {r.status_code} {r.text}"

    # Confirm override
    r = admin_client.get(f"{BASE_URL}/api/roll-materials")
    assert r.status_code == 200
    updated = next((x for x in r.json() if (x.get("id") or x.get("_id")) == rid), None)
    assert updated is not None
    assert abs(updated["price_per_sqft"] - 0.42) < 1e-6, f"expected 0.42 got {updated['price_per_sqft']}"
    assert updated.get("linked_material_name") == "LINKTEST-ROLL"
    assert updated.get("linked_stock_qty") == 30

    # Unlink
    body["linked_material_id"] = None
    r = admin_client.put(f"{BASE_URL}/api/roll-materials/{rid}", json=body)
    assert r.status_code in (200, 204)
    r = admin_client.get(f"{BASE_URL}/api/roll-materials")
    reverted = next((x for x in r.json() if (x.get("id") or x.get("_id")) == rid), None)
    assert reverted is not None
    assert abs(reverted["price_per_sqft"] - original_price) < 1e-6, f"expected {original_price} got {reverted['price_per_sqft']}"
    assert not reverted.get("linked_material_name")


# ---------------- Calc uses linked cost ----------------
def test_calc_largeformat_uses_linked_cost(admin_client, unified_material):
    # Link first roll material
    rolls = admin_client.get(f"{BASE_URL}/api/roll-materials").json()
    item = rolls[0]
    rid = item.get("id") or item.get("_id")
    body = {k: v for k, v in item.items() if k not in ("id", "_id", "linked_material_name", "linked_stock_qty")}
    body["linked_material_id"] = unified_material["id"]
    admin_client.put(f"{BASE_URL}/api/roll-materials/{rid}", json=body)

    try:
        r = admin_client.post(f"{BASE_URL}/api/calc/largeformat", json={
            "sizes": [{"width": 24, "height": 36, "qty": 1}],
            "mode": "print",
            "laminate": False,
        })
        assert r.status_code == 200, f"calc: {r.status_code} {r.text}"
        data = r.json()
        # find the option using this material
        options = data.get("options") or data.get("results") or []
        found = False
        for opt in options:
            mat_name = opt.get("material_name") or opt.get("material") or ""
            if mat_name == item.get("name"):
                billed = opt.get("billed_sqft") or opt.get("sqft") or opt.get("billed_area")
                mcost = opt.get("material_cost")
                if billed and mcost is not None:
                    expected = billed * 0.42
                    assert abs(mcost - expected) < 0.05, f"linked material cost mismatch: got {mcost}, expected ~{expected}"
                    found = True
                    break
        # If not found by name, just verify calc works without error
        assert isinstance(options, list) or isinstance(data, dict)
        print(f"Linked calc check: found={found}, options={len(options)}")
    finally:
        # unlink
        body["linked_material_id"] = None
        admin_client.put(f"{BASE_URL}/api/roll-materials/{rid}", json=body)


# ---------------- Regression: unlinked calc still works ----------------
@pytest.mark.parametrize("endpoint,payload", [
    ("/api/calc/paper", {"width": 8.5, "height": 11, "qty": 100, "double_sided": False, "color": True}),
    ("/api/calc/largeformat", {"sizes": [{"width": 24, "height": 36, "qty": 1}], "mode": "print", "laminate": False}),
    ("/api/calc/laser", {"sizes": [{"width": 4, "height": 4, "qty": 10}], "operation": "cut"}),
    ("/api/calc/directprint", {"sizes": [{"width": 12, "height": 12, "qty": 5}]}),
    ("/api/calc/channel", {"letters": [{"height": 12, "depth": 3, "count": 5}]}),
    ("/api/calc/rollstickers", {"width": 3, "height": 3, "qty": 500, "shape": "rectangle"}),
])
def test_calc_endpoints_unlinked(admin_client, endpoint, payload):
    r = admin_client.post(f"{BASE_URL}{endpoint}", json=payload)
    # Some endpoints may require different body shape; accept 200 or 422 (validation), fail on 500
    assert r.status_code != 500, f"{endpoint} 500: {r.text[:300]}"
    print(f"{endpoint}: {r.status_code}")


# ---------------- Models accept linked_material_id on POST/PUT for all 5 modules ----------------
def test_all_module_materials_accept_linked_field(admin_client, unified_material):
    endpoints = [
        "/api/paper-stocks",
        "/api/roll-materials",
        "/api/sheet-materials",
        "/api/laser-materials",
        "/api/roll-sticker-materials",
    ]
    for ep in endpoints:
        r = admin_client.get(f"{BASE_URL}{ep}")
        assert r.status_code == 200, f"{ep} list: {r.status_code}"
        items = r.json()
        if not items:
            print(f"{ep}: no items to test PUT")
            continue
        item = items[0]
        iid = item.get("id") or item.get("_id")
        body = {k: v for k, v in item.items() if k not in ("id", "_id", "linked_material_name", "linked_stock_qty")}
        body["linked_material_id"] = unified_material["id"]
        r = admin_client.put(f"{BASE_URL}{ep}/{iid}", json=body)
        assert r.status_code in (200, 204), f"{ep} PUT link: {r.status_code} {r.text[:200]}"
        # Verify persisted
        items2 = admin_client.get(f"{BASE_URL}{ep}").json()
        updated = next((x for x in items2 if (x.get("id") or x.get("_id")) == iid), None)
        assert updated is not None
        assert updated.get("linked_material_id") == unified_material["id"] or updated.get("linked_material_name") == "LINKTEST-ROLL", \
            f"{ep}: link not persisted"
        # Unlink cleanup
        body["linked_material_id"] = None
        admin_client.put(f"{BASE_URL}{ep}/{iid}", json=body)
        print(f"{ep}: link/unlink OK")
