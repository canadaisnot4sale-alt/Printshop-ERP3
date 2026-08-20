"""Seed / cleanup data for frontend Phase2-4 UI testing. Usage: python seed_fe_phase2.py [seed|clean]"""
import sys, json, os, requests
from dotenv import dotenv_values
BASE = (dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"
S = requests.Session()
S.headers.update({"Authorization": "Bearer " + S.post(f"{API}/auth/login", json={"email": "admin@printandsave.ca", "password": "admin123"}).json()["token"]})
STATE = "/tmp/fe_seed_phase2.json"

if sys.argv[1] if len(sys.argv) > 1 else "seed" == "seed":
    pass

mode = sys.argv[1] if len(sys.argv) > 1 else "seed"
if mode == "seed":
    st = {"materials": [], "products": [], "orders": [], "machines": []}
    mat = S.post(f"{API}/materials", json={"name": "TESTFE_Vinyl", "category": "sheet", "unit": "sheet", "unit_cost": 3.0, "stock_qty": 900}).json()
    st["materials"].append(mat["id"])
    mach = S.post(f"{API}/machines", json={"name": "TESTFE_Printer", "category": "largeformat", "ink_ml_per_sqft_full": 10.0}).json()
    st["machines"].append(mach["id"])
    ink = S.post(f"{API}/materials", json={"name": "TESTFE_Ink", "category": "ink", "unit": "each", "unit_cost": 120.0, "ink_volume_ml": 1000.0, "stock_qty": 4, "machine_id": mach["id"]}).json()
    st["materials"].append(ink["id"])
    prod = S.post(f"{API}/catalog-products", json={"name": "TESTFE_Banner", "category": "Signs", "published": True, "retail_markup_pct": 200,
                                                  "bom": [{"material_id": mat["id"], "material_name": "TESTFE_Vinyl", "qty_per_unit": 2.0}]}).json()
    st["products"].append(prod["id"])
    o = S.post(f"{API}/orders", json={"items": [{"product_id": prod["id"], "qty": 6}], "customer_name": "TESTFE_Customer"}).json()
    st["orders"].append(o["id"])
    st["machine_id"] = mach["id"]
    st["order_id"] = o["id"]
    open(STATE, "w").write(json.dumps(st))
    print(json.dumps(st, indent=1))
else:
    st = json.load(open(STATE))
    # remove any extra TEST orders created via UI
    for o in S.get(f"{API}/orders").json():
        nm = json.dumps(o.get("items") or []) + (o.get("customer_name") or "")
        if "TESTFE" in nm:
            S.delete(f"{API}/orders/{o['id']}")
    for oid in st["orders"]:
        S.delete(f"{API}/orders/{oid}")
    for pid in st["products"]:
        S.delete(f"{API}/catalog-products/{pid}")
    for mid in st["materials"]:
        S.delete(f"{API}/materials/{mid}")
    for mid in st["machines"]:
        S.delete(f"{API}/machines/{mid}")
    print("cleaned")
