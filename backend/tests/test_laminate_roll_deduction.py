"""Tests for Laminate/Hot-Foil roll-count inventory + smart per-roll deduction.

Feature contract (iteration 32):
- Materials with category='paper' and paper_type in {'laminate','hot_foil'} store the
  physical roll count in `stock_qty` (NOT linear feet). Roll length is `lam_length_ft`.
- POST /api/materials/{mid}/adjust-stock adjusts stock_qty by +/- delta (rolls).
- When orders consume laminate/foil linear feet, the accumulator field
  `lam_open_used_ft` tracks feet used on the currently-open roll, and `stock_qty`
  (roll count) decrements ONLY when accumulated usage >= lam_length_ft; remainder
  stays in lam_open_used_ft.
"""
import os
import time
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture
def laminate_material(admin_client):
    """Create a laminate material with roll count = 10 and roll length = 500 ft."""
    payload = {
        "name": "TEST_Laminate_Roll_500ft",
        "code": "TEST-LAM-500",
        "category": "paper",
        "unit": "ft",
        "paper_type": "laminate",
        "lam_width_in": 12.75,
        "lam_length_ft": 500,
        "lam_roll_cost": 275,
        "stock_qty": 10,
        "reorder_point": 2,
        "reorder_target": 10,
    }
    r = admin_client.post(f"{BASE_URL}/api/materials", json=payload, timeout=15)
    assert r.status_code == 200, f"create laminate failed: {r.status_code} {r.text}"
    m = r.json()
    yield m
    admin_client.delete(f"{BASE_URL}/api/materials/{m['id']}", timeout=15)


@pytest.fixture
def hotfoil_material(admin_client):
    payload = {
        "name": "TEST_HotFoil_Gold_500ft",
        "code": "TEST-FOIL-500",
        "category": "paper",
        "unit": "ft",
        "paper_type": "hot_foil",
        "lam_width_in": 12,
        "lam_length_ft": 500,
        "lam_roll_cost": 220,
        "foil_color": "Gold",
        "stock_qty": 5,
        "reorder_point": 1,
        "reorder_target": 5,
    }
    r = admin_client.post(f"{BASE_URL}/api/materials", json=payload, timeout=15)
    assert r.status_code == 200, f"create hot foil failed: {r.status_code} {r.text}"
    m = r.json()
    yield m
    admin_client.delete(f"{BASE_URL}/api/materials/{m['id']}", timeout=15)


# ---------- creation contract ----------

class TestCreateRollMaterials:
    def test_create_laminate_stores_rolls_in_stock_qty(self, laminate_material):
        assert laminate_material["paper_type"] == "laminate"
        assert laminate_material["category"] == "paper"
        # stock_qty MUST be roll count (10), not linear feet
        assert float(laminate_material["stock_qty"]) == 10.0, \
            f"expected 10 rolls, got {laminate_material['stock_qty']}"
        assert float(laminate_material["lam_length_ft"]) == 500.0
        assert float(laminate_material["reorder_point"]) == 2.0
        assert float(laminate_material.get("lam_open_used_ft", 0)) == 0.0

    def test_create_hot_foil_stores_rolls_and_color(self, hotfoil_material):
        assert hotfoil_material["paper_type"] == "hot_foil"
        assert hotfoil_material["foil_color"] == "Gold"
        assert float(hotfoil_material["stock_qty"]) == 5.0
        assert float(hotfoil_material["lam_length_ft"]) == 500.0

    def test_get_material_persistence(self, admin_client, laminate_material):
        r = admin_client.get(f"{BASE_URL}/api/materials", timeout=15)
        assert r.status_code == 200
        rows = [m for m in r.json() if m["id"] == laminate_material["id"]]
        assert len(rows) == 1
        m = rows[0]
        assert m["paper_type"] == "laminate"
        assert float(m["stock_qty"]) == 10.0


# ---------- adjust-stock endpoint ----------

class TestAdjustStockRolls:
    def test_plus_one_increments_roll_count(self, admin_client, laminate_material):
        mid = laminate_material["id"]
        r = admin_client.post(f"{BASE_URL}/api/materials/{mid}/adjust-stock",
                              json={"delta": 1}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert float(data["stock_qty"]) == 11.0

    def test_minus_one_decrements_roll_count(self, admin_client, laminate_material):
        mid = laminate_material["id"]
        r = admin_client.post(f"{BASE_URL}/api/materials/{mid}/adjust-stock",
                              json={"delta": -1}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert float(data["stock_qty"]) == 9.0

    def test_adjust_stock_clamps_at_zero(self, admin_client, laminate_material):
        mid = laminate_material["id"]
        r = admin_client.post(f"{BASE_URL}/api/materials/{mid}/adjust-stock",
                              json={"delta": -100}, timeout=15)
        assert r.status_code == 200, r.text
        assert float(r.json()["stock_qty"]) == 0.0

    def test_adjust_stock_hot_foil(self, admin_client, hotfoil_material):
        mid = hotfoil_material["id"]
        r = admin_client.post(f"{BASE_URL}/api/materials/{mid}/adjust-stock",
                              json={"delta": 1}, timeout=15)
        assert r.status_code == 200
        assert float(r.json()["stock_qty"]) == 6.0


# ---------- smart per-roll deduction via order conversion ----------

def _seed_catalog_product(mongo, lam_mid, ft_per_order):
    """Directly insert a published catalog_product bound to the laminate material."""
    doc = {
        "name": "TEST_LamProduct",
        "category": "Other",
        "module": "paper",
        "price": 100.0,
        "wholesale_price": 80.0,
        "description": "roll dedux test",
        "published": True,
        "bom": [],
        "lam_material_id": lam_mid,
        "lam_ft_per_order": float(ft_per_order),
        "created_at": "2026-01-01T00:00:00",
    }
    return mongo.catalog_products.insert_one(doc).inserted_id


class TestOrderRollDeduction:
    """
    Roll length 500 ft, stock 10 rolls:
      - order consuming 300 ft  -> stock_qty=10, lam_open_used_ft=300
      - +300 ft (total 600>500) -> stock_qty=9,  lam_open_used_ft=100
    """

    def test_smart_accumulator_across_two_orders(
        self, admin_client, mongo, laminate_material
    ):
        mid = laminate_material["id"]
        # Reset accumulator + stock deterministically
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0,
                      "lam_length_ft": 500.0}},
        )
        prod_ids = []
        try:
            pid1 = _seed_catalog_product(mongo, mid, 300)  # qty=1 -> 300 ft
            prod_ids.append(pid1)
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid1), "qty": 1}],
                                        "notes": "TEST order 1"}, timeout=20)
            assert r.status_code == 200, r.text
            m_after_1 = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m_after_1["stock_qty"]) == 10.0, \
                f"after 300 ft: stock_qty should still be 10 rolls, got {m_after_1['stock_qty']}"
            assert abs(float(m_after_1["lam_open_used_ft"]) - 300.0) < 0.01, \
                f"expected accumulator=300, got {m_after_1['lam_open_used_ft']}"

            # Second order consuming another 300 ft -> total 600 -> 1 roll consumed, remainder 100
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid1), "qty": 1}],
                                        "notes": "TEST order 2"}, timeout=20)
            assert r.status_code == 200, r.text
            m_after_2 = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m_after_2["stock_qty"]) == 9.0, \
                f"after 600 ft cumulative: stock_qty should be 9, got {m_after_2['stock_qty']}"
            assert abs(float(m_after_2["lam_open_used_ft"]) - 100.0) < 0.01, \
                f"expected accumulator remainder=100, got {m_after_2['lam_open_used_ft']}"
        finally:
            for pid in prod_ids:
                mongo.catalog_products.delete_one({"_id": pid})
            # cleanup TEST orders
            mongo.orders.delete_many({"notes": {"$regex": "^TEST order"}})

    def test_multi_roll_consumption_in_single_order(
        self, admin_client, mongo, laminate_material
    ):
        """Single order consuming 1250 ft on a 500-ft roll = 2 rolls consumed, 250 ft remainder."""
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 0.0,
                      "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 1250)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST order multiroll"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 8.0, \
                f"expected 10-2=8 rolls, got {m['stock_qty']}"
            assert abs(float(m["lam_open_used_ft"]) - 250.0) < 0.01, \
                f"expected remainder 250 ft, got {m['lam_open_used_ft']}"
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST order"}})

    def test_carry_forward_with_preexisting_accumulator(
        self, admin_client, mongo, laminate_material
    ):
        """Pre-seed accumulator=400 ft, then order 200 ft -> total 600 -> stock-1, remainder 100."""
        mid = laminate_material["id"]
        mongo.materials.update_one(
            {"_id": ObjectId(mid)},
            {"$set": {"stock_qty": 10.0, "lam_open_used_ft": 400.0,
                      "lam_length_ft": 500.0}},
        )
        pid = _seed_catalog_product(mongo, mid, 200)
        try:
            r = admin_client.post(f"{BASE_URL}/api/orders",
                                  json={"items": [{"product_id": str(pid), "qty": 1}],
                                        "notes": "TEST order carryfwd"}, timeout=20)
            assert r.status_code == 200, r.text
            m = mongo.materials.find_one({"_id": ObjectId(mid)})
            assert float(m["stock_qty"]) == 9.0
            assert abs(float(m["lam_open_used_ft"]) - 100.0) < 0.01
        finally:
            mongo.catalog_products.delete_one({"_id": pid})
            mongo.orders.delete_many({"notes": {"$regex": "^TEST order"}})
