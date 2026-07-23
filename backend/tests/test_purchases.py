"""Tests for /api/purchases* endpoints (PDF invoice import feature)."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printshop-erp-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ALFA_URL = "https://customer-assets-agu9un31.emergentagent.net/job_printshop-erp-3/artifacts/9b7javnn_Inv_177613_from_Alfa_Paper_11220.pdf"
GRIMCO_URL = "https://customer-assets-agu9un31.emergentagent.net/job_printshop-erp-3/artifacts/dcenb28r_order_confirmation_60460.pdf"

ADMIN = {"email": "admin@printandsave.ca", "password": "admin123"}
RESELLER = {"email": "cliente1@test.com", "password": "test123"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def reseller_token():
    r = requests.post(f"{API}/auth/login", json=RESELLER, timeout=15)
    if r.status_code != 200:
        pytest.skip("Reseller login failed")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def alfa_pdf_bytes():
    r = requests.get(ALFA_URL, timeout=30)
    assert r.status_code == 200
    return r.content


@pytest.fixture(scope="session")
def grimco_pdf_bytes():
    r = requests.get(GRIMCO_URL, timeout=30)
    assert r.status_code == 200
    return r.content


@pytest.fixture(scope="session")
def alfa_parsed(admin_headers, alfa_pdf_bytes):
    files = {"file": ("alfa.pdf", alfa_pdf_bytes, "application/pdf")}
    r = requests.post(f"{API}/purchases/parse", files=files, headers=admin_headers, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- PARSE ----------
class TestParse:
    def test_parse_alfa(self, alfa_parsed):
        d = alfa_parsed
        assert (d.get("supplier") or {}).get("company", "").lower().startswith("alfa")
        assert d.get("invoice_number") == "177613"
        assert isinstance(d.get("line_items"), list) and len(d["line_items"]) > 0
        for li in d["line_items"]:
            assert "code" in li and "description" in li
            assert "quantity" in li and "unit_price" in li
        assert isinstance(d.get("subtotal"), (int, float))
        assert isinstance(d.get("gst"), (int, float))
        assert isinstance(d.get("total"), (int, float))
        assert "paper" in (d.get("suggested_modules") or [])
        assert d.get("suggested_category") == "sheet"

    def test_parse_grimco(self, admin_headers, grimco_pdf_bytes):
        files = {"file": ("grimco.pdf", grimco_pdf_bytes, "application/pdf")}
        r = requests.post(f"{API}/purchases/parse", files=files, headers=admin_headers, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        mods = d.get("suggested_modules") or []
        assert "large-format" in mods
        assert "direct-print" in mods


# ---------- CREATE + UPSERT ----------
class TestCreateAndUpsert:
    _created_purchase_ids = []

    def _build_payload(self, parsed):
        return {
            "supplier": parsed.get("supplier") or {},
            "invoice_number": parsed.get("invoice_number", ""),
            "date": parsed.get("date", ""),
            "po_number": parsed.get("po_number", ""),
            "currency": parsed.get("currency", "CAD"),
            "subtotal": parsed.get("subtotal", 0),
            "gst": parsed.get("gst", 0),
            "pst": parsed.get("pst", 0),
            "shipping": parsed.get("shipping", 0),
            "total": parsed.get("total", 0),
            "default_category": parsed.get("suggested_category", "sheet"),
            "modules": parsed.get("suggested_modules", ["paper"]),
            "update_inventory": True,
            "line_items": [
                {
                    "code": li.get("code", ""),
                    "description": li.get("description", ""),
                    "name": (li.get("description") or "")[:60],
                    "quantity": float(li.get("quantity") or 0),
                    "unit": li.get("unit", ""),
                    "unit_price": float(li.get("unit_price") or 0),
                    "line_total": float(li.get("line_total") or 0),
                    "import_material": True,
                } for li in parsed.get("line_items", [])
            ],
        }

    def test_create_upserts_new_materials(self, admin_headers, alfa_parsed):
        payload = self._build_payload(alfa_parsed)
        # Sanity: give test-unique codes to avoid clobbering seeded data
        for i, li in enumerate(payload["line_items"]):
            li["code"] = f"TEST_{li['code'] or 'X'}_{int(time.time())}_{i}"
        r = requests.post(f"{API}/purchases", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        saved = r.json()
        self.__class__._created_purchase_ids.append(saved.get("id") or saved.get("_id"))
        affected = saved.get("materials_affected") or []
        assert len(affected) == len(payload["line_items"])
        assert all(a["action"] == "created" for a in affected)

        # Verify materials exist with correct cost/stock
        m = requests.get(f"{API}/materials", headers=admin_headers, timeout=15).json()
        by_code = {x.get("code"): x for x in m if x.get("code", "").startswith("TEST_")}
        for li in payload["line_items"]:
            mat = by_code.get(li["code"])
            assert mat is not None, f"material {li['code']} not found"
            assert abs(mat["unit_cost"] - li["unit_price"]) < 0.01
            assert abs(mat["stock_qty"] - li["quantity"]) < 0.01
            assert "paper" in (mat.get("modules") or [])

        # Store payload for re-post test
        self.__class__._last_payload = payload

    def test_create_updates_existing_materials(self, admin_headers):
        payload = self.__class__._last_payload
        # Change unit_price to check update
        for li in payload["line_items"]:
            li["unit_price"] = round(li["unit_price"] + 1.11, 2)
        r = requests.post(f"{API}/purchases", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        saved = r.json()
        self.__class__._created_purchase_ids.append(saved.get("id") or saved.get("_id"))
        affected = saved.get("materials_affected") or []
        assert all(a["action"] == "updated" for a in affected), affected

        # verify stock added (doubled) and cost updated
        m = requests.get(f"{API}/materials", headers=admin_headers, timeout=15).json()
        by_code = {x.get("code"): x for x in m if x.get("code", "").startswith("TEST_")}
        for li in payload["line_items"]:
            mat = by_code.get(li["code"])
            assert mat is not None
            assert abs(mat["stock_qty"] - li["quantity"] * 2) < 0.01, f"stock not added: {mat['stock_qty']} vs {li['quantity']*2}"
            assert abs(mat["unit_cost"] - li["unit_price"]) < 0.01

    def test_list_purchases_and_filter(self, admin_headers):
        r = requests.get(f"{API}/purchases", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 2
        # sorted desc by date
        dates = [i.get("date", "") for i in items]
        assert dates == sorted(dates, reverse=True)
        # supplier filter
        r2 = requests.get(f"{API}/purchases?supplier=Alfa", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        for i in r2.json():
            assert "alfa" in ((i.get("supplier") or {}).get("company", "")).lower()

    def test_csv_export(self, admin_headers):
        r = requests.get(f"{API}/purchases/export.csv", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
        body = r.text
        first_line = body.splitlines()[0]
        assert first_line.startswith("Date,Supplier,Invoice #")
        assert first_line.rstrip().endswith("Total")
        assert len(body.splitlines()) >= 2

    def test_delete_purchase_and_cleanup(self, admin_headers):
        # delete all created purchases
        for pid in list(self.__class__._created_purchase_ids):
            if not pid:
                continue
            r = requests.delete(f"{API}/purchases/{pid}", headers=admin_headers, timeout=15)
            assert r.status_code == 200
        # confirm deletion of last one -> not present in list
        r = requests.get(f"{API}/purchases", headers=admin_headers, timeout=15)
        ids = [i.get("id") for i in r.json()]
        for pid in self.__class__._created_purchase_ids:
            assert pid not in ids

        # cleanup TEST_ materials
        m = requests.get(f"{API}/materials", headers=admin_headers, timeout=15).json()
        for mat in m:
            if (mat.get("code") or "").startswith("TEST_"):
                requests.delete(f"{API}/materials/{mat['id']}", headers=admin_headers, timeout=10)


# ---------- RBAC ----------
class TestRBAC:
    def test_reseller_forbidden(self, reseller_token):
        h = {"Authorization": f"Bearer {reseller_token}"}
        r = requests.get(f"{API}/purchases", headers=h, timeout=10)
        assert r.status_code in (401, 403), r.status_code
        r2 = requests.get(f"{API}/purchases/export.csv", headers=h, timeout=10)
        assert r2.status_code in (401, 403)
        # parse endpoint
        r3 = requests.post(f"{API}/purchases/parse", files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")}, headers=h, timeout=10)
        assert r3.status_code in (401, 403)
