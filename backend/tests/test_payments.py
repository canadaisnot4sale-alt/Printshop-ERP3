"""Backend tests for Stripe payment E2E (checkout URL creation, status polling)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@printandsave.ca"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def published_product(admin_headers):
    # Ensure at least one published product exists
    r = requests.get(f"{BASE_URL}/api/catalog-products", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    products = r.json()
    pub = [p for p in products if p.get("published")]
    if pub:
        return pub[0]
    # create one
    payload = {"name": "TEST_Stripe_Product", "category": "Print", "price": 25.0,
               "published": True, "bom": []}
    r = requests.post(f"{BASE_URL}/api/catalog-products", headers=admin_headers,
                      json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


def test_published_product_exists(published_product):
    assert published_product.get("published") is True
    assert float(published_product.get("price") or 0) > 0


def test_create_order_and_checkout(admin_headers, published_product):
    # Create a simple order via /api/orders (admin can create)
    order_payload = {
        "customer_name": "TEST_Payer",
        "items": [{
            "product_id": published_product.get("id") or published_product.get("_id"),
            "name": published_product["name"],
            "qty": 1,
            "unit_price": float(published_product["price"]),
            "line_total": float(published_product["price"]),
        }],
        "total": float(published_product["price"]),
        "status": "pending",
    }
    r = requests.post(f"{BASE_URL}/api/orders", headers=admin_headers, json=order_payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    order = r.json()
    oid = order.get("id") or order.get("_id")
    assert oid

    # Create checkout session
    r = requests.post(f"{BASE_URL}/api/payments/checkout", headers=admin_headers,
                      json={"order_id": oid, "origin_url": "https://example.com"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "checkout_url" in body and "checkout.stripe.com" in body["checkout_url"]
    assert "session_id" in body

    # Status endpoint should return pending
    sid = body["session_id"]
    r = requests.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_id"] == sid
    assert data["payment_status"] in ("pending", "paid")


def test_checkout_requires_auth():
    r = requests.post(f"{BASE_URL}/api/payments/checkout",
                      json={"order_id": "x", "origin_url": "https://x"}, timeout=10)
    assert r.status_code in (401, 403)


def test_status_unknown_session_404():
    r = requests.get(f"{BASE_URL}/api/payments/status/cs_test_doesnotexist_xyz", timeout=10)
    assert r.status_code == 404
