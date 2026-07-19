from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, EmailStr
from typing import List, Optional, Annotated, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import logging
import math
import jwt
import bcrypt
import secrets

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Print and Save ERP")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

# ---------------- Mongo helpers ----------------
def to_str_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(to_str_id)]

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def clean(doc):
    if not doc:
        return doc
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc

# ---------------- Auth utils ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return clean(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str = "User"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PaperStock(BaseModel):
    name: str
    size: str = "8.5x11"
    sheets_per_box: float = 500
    cost_per_box: float = 0.0
    cost_per_sheet: Optional[float] = None

class Product(BaseModel):
    name: str
    finished_w: float
    finished_h: float
    bleed_w: Optional[float] = None
    bleed_h: Optional[float] = None

class RollMaterial(BaseModel):
    name: str
    code: str = ""
    roll_width: float = 54.0
    printable_width: float = 52.0
    price_per_sqft: float = 0.0
    min_linear_feet: float = 1.0
    sticker_compatible: bool = False
    material_type: str = "vinyl"

class Equipment(BaseModel):
    name: str
    ink_config: str = "CMYK"
    cartridge_ml: float = 220
    ink_price: float = 0.0
    ink_consumption_ml_sqft: float = 0.5
    maintenance_pct: float = 5.0

class SizePreset(BaseModel):
    name: str
    width: float
    height: float

class Settings(BaseModel):
    retail_markup_pct: float = 200.0
    wholesale_markup_pct: float = 100.0
    click_4_0: float = 0.08
    click_4_4: float = 0.16
    lamination_per_sheet: float = 0.25
    lf_lamination_per_sqft: float = 1.50
    lf_diecut_transfer_per_sqft: float = 2.50
    lf_print_per_sqft: float = 1.00
    tiling_overlap_in: float = 1.0
    binding_saddle: float = 2.50
    binding_spiral: float = 3.50
    binding_wireo: float = 4.00
    binding_perfect: float = 5.00
    binding_per_page: float = 0.03
    currency: str = "CAD"

SHEET_SIZES = {
    "8.5x11": (8.5, 11), "8.5x14": (8.5, 14), "11x17": (11, 17),
    "12x18": (12, 18), "13x19": (13, 19),
}
STANDARD_QTYS = [25, 50, 100, 250, 500, 1000, 2500, 5000]

# ---------------- Settings helpers ----------------
async def get_settings() -> dict:
    s = await db.settings.find_one({"_key": "global"})
    if not s:
        d = Settings().model_dump()
        d["_key"] = "global"
        await db.settings.insert_one(d)
        s = d
    s = dict(s)
    s.pop("_id", None)
    s.pop("_key", None)
    return s

# ---------------- Calc engines ----------------
def pieces_per_sheet(sheet_w, sheet_h, pw, ph):
    def fit(SW, SH, w, h):
        if w <= 0 or h <= 0:
            return 0
        return int(SW // w) * int(SH // h)
    a = max(fit(sheet_w, sheet_h, pw, ph), fit(sheet_w, sheet_h, ph, pw))
    return a

def markup_price(cost, pct):
    return round(cost * (1 + pct / 100.0), 2)

def paper_quote(product, stock, settings, qtys, laminate=False, sheet_key="13x19"):
    sw, sh = SHEET_SIZES.get(sheet_key, (13, 19))
    pw = product.get("bleed_w") or product["finished_w"]
    ph = product.get("bleed_h") or product["finished_h"]
    n_up = pieces_per_sheet(sw, sh, pw, ph)
    cps = stock.get("cost_per_sheet")
    if cps is None:
        cps = (stock["cost_per_box"] / stock["sheets_per_box"]) if stock.get("sheets_per_box") else 0
    rows = []
    for q in qtys:
        sheets = math.ceil(q / n_up) if n_up else 0
        material = round(sheets * cps, 2)
        cost_40 = round(sheets * settings["click_4_0"], 2)
        cost_44 = round(sheets * settings["click_4_4"], 2)
        lam = round(sheets * settings["lamination_per_sheet"], 2) if laminate else 0.0
        base_40 = material + cost_40 + lam
        base_44 = material + cost_44 + lam
        rows.append({
            "qty": q, "sheets": sheets, "n_up": n_up,
            "material_cost": material, "cost_4_0": cost_40, "cost_4_4": cost_44,
            "lamination": lam,
            "customer_price_4_0": markup_price(base_40, settings["retail_markup_pct"]),
            "customer_price_4_4": markup_price(base_44, settings["retail_markup_pct"]),
            "wholesale_price_4_0": markup_price(base_40, settings["wholesale_markup_pct"]),
            "wholesale_price_4_4": markup_price(base_44, settings["wholesale_markup_pct"]),
        })
    return {"n_up": n_up, "sheet": sheet_key, "cost_per_sheet": round(cps, 4), "rows": rows}

def lf_estimate(material, settings, w, h, qty=1, mode="print", laminate=False):
    """w,h in inches. Returns per-material estimate incl nesting/tiling."""
    printable = material["printable_width"]
    overlap = settings["tiling_overlap_in"]
    # orient so smaller dim aligns to width if possible
    fits = min(w, h) <= printable
    tiled = False
    panels = 1
    design_w = min(w, h)  # width across roll
    length_in = max(w, h)
    if not fits:
        # need tiling: tile along the larger-than-printable dimension
        tiled = True
        design_w = printable
        # panels needed to cover the wide dimension
        wide = max(w, h)
        panels = math.ceil(wide / (printable - overlap))
        length_in = min(w, h)  # the other dim becomes length per panel
        used_area_sqft = (printable * length_in * panels) / 144.0
    else:
        used_area_sqft = (w * h) / 144.0
    used_area_sqft *= qty
    # minimum charge
    min_area = (printable * material["min_linear_feet"] * 12.0) / 144.0
    billed_area = max(used_area_sqft, min_area)
    material_cost = round(billed_area * material["price_per_sqft"], 2)
    printing_cost = round(billed_area * settings["lf_print_per_sqft"], 2)
    extra = 0.0
    if mode == "print_lam" or laminate:
        extra += billed_area * settings["lf_lamination_per_sqft"]
    if mode == "print_diecut":
        extra += billed_area * settings["lf_diecut_transfer_per_sqft"]
    extra = round(extra, 2)
    base = material_cost + printing_cost + extra
    return {
        "material": material["name"], "material_id": material.get("id"),
        "fits": fits, "tiled": tiled, "panels": panels,
        "billed_sqft": round(billed_area, 3), "used_sqft": round(used_area_sqft, 3),
        "material_cost": material_cost, "printing_cost": printing_cost, "extra_cost": extra,
        "selling_price": markup_price(base, settings["retail_markup_pct"]),
        "wholesale_price": markup_price(base, settings["wholesale_markup_pct"]),
    }

def equipment_cost(eq):
    cost_per_ml = (eq["ink_price"] / eq["cartridge_ml"]) if eq["cartridge_ml"] else 0
    ink_cost_sqft = cost_per_ml * eq["ink_consumption_ml_sqft"]
    true_cost = ink_cost_sqft * (1 + eq["maintenance_pct"] / 100.0)
    return {
        "cost_per_ml": round(cost_per_ml, 4),
        "ink_cost_per_sqft": round(ink_cost_sqft, 4),
        "true_cost_per_sqft": round(true_cost, 4),
    }

# ---------------- Auth routes ----------------
@api_router.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"email": email, "password_hash": hash_password(body.password),
           "name": body.name, "role": "user", "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": {"id": uid, "email": email, "name": body.name, "role": "user"}}

@api_router.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": clean(user)}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ---------------- Generic CRUD factory ----------------
def register_crud(path, model, collection, transform=None):
    coll = db[collection]

    @api_router.get(f"/{path}")
    async def list_items(user=Depends(get_current_user)):
        items = await coll.find().sort("created_at", -1).to_list(1000)
        return [clean(i) for i in items]

    @api_router.post(f"/{path}")
    async def create_item(body: model, user=Depends(get_current_user)):
        doc = body.model_dump()
        if transform:
            transform(doc)
        doc["created_at"] = now_iso()
        res = await coll.insert_one(doc)
        doc["_id"] = res.inserted_id
        return clean(doc)

    @api_router.put(f"/{path}/{{item_id}}")
    async def update_item(item_id: str, body: model, user=Depends(get_current_user)):
        doc = body.model_dump()
        if transform:
            transform(doc)
        await coll.update_one({"_id": ObjectId(item_id)}, {"$set": doc})
        updated = await coll.find_one({"_id": ObjectId(item_id)})
        return clean(updated)

    @api_router.delete(f"/{path}/{{item_id}}")
    async def delete_item(item_id: str, user=Depends(get_current_user)):
        await coll.delete_one({"_id": ObjectId(item_id)})
        return {"ok": True}

def paper_transform(doc):
    if not doc.get("cost_per_sheet") and doc.get("sheets_per_box"):
        doc["cost_per_sheet"] = round(doc["cost_per_box"] / doc["sheets_per_box"], 4)

register_crud("paper-stocks", PaperStock, "paper_stocks", paper_transform)
register_crud("products", Product, "products")
register_crud("roll-materials", RollMaterial, "roll_materials")
register_crud("equipment", Equipment, "equipment")
register_crud("size-presets", SizePreset, "size_presets")

# ---------------- Settings routes ----------------
@api_router.get("/settings")
async def read_settings(user=Depends(get_current_user)):
    return await get_settings()

@api_router.put("/settings")
async def write_settings(body: Settings, user=Depends(get_current_user)):
    d = body.model_dump()
    await db.settings.update_one({"_key": "global"}, {"$set": d}, upsert=True)
    return await get_settings()

# ---------------- Calculation routes ----------------
class PaperCalcIn(BaseModel):
    product_id: str
    sheet_key: str = "13x19"
    laminate: bool = False
    stock_ids: Optional[List[str]] = None

@api_router.post("/calc/paper")
async def calc_paper(body: PaperCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    product = await db.products.find_one({"_id": ObjectId(body.product_id)})
    if not product:
        raise HTTPException(404, "Product not found")
    product = clean(product)
    q = {"_id": {"$in": [ObjectId(s) for s in body.stock_ids]}} if body.stock_ids else {}
    stocks = [clean(s) for s in await db.paper_stocks.find(q).to_list(200)]
    results = []
    for st in stocks:
        quote = paper_quote(product, st, settings, STANDARD_QTYS, body.laminate, body.sheet_key)
        results.append({"stock": st, "quote": quote})
    results.sort(key=lambda r: r["quote"]["rows"][3]["customer_price_4_4"] if r["quote"]["rows"] else 0)
    return {"product": product, "sheet_key": body.sheet_key, "results": results, "qtys": STANDARD_QTYS}

class BookletCalcIn(BaseModel):
    cover_stock_id: str
    inside_stock_id: str
    page_count: int = 8
    quantity: int = 100
    width: float = 8.5
    height: float = 11.0
    binding: str = "saddle"
    laminate_cover: bool = False
    sheet_key: str = "13x19"

@api_router.post("/calc/booklet")
async def calc_booklet(body: BookletCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    cover = await db.paper_stocks.find_one({"_id": ObjectId(body.cover_stock_id)})
    inside = await db.paper_stocks.find_one({"_id": ObjectId(body.inside_stock_id)})
    if not cover or not inside:
        raise HTTPException(404, "Stock not found")
    cover, inside = clean(cover), clean(inside)
    def cps(s):
        return s.get("cost_per_sheet") or (s["cost_per_box"] / s["sheets_per_box"] if s.get("sheets_per_box") else 0)
    # 2-up imposition on selected sheet (folded)
    n_up = pieces_per_sheet(*SHEET_SIZES.get(body.sheet_key, (13, 19)), body.width, body.height)
    n_up = max(n_up, 1)
    inside_sheets_per_book = math.ceil((body.page_count - 4) / 4) if body.page_count > 4 else 1
    cover_sheets = math.ceil(body.quantity / n_up)
    inside_sheets = math.ceil(body.quantity * inside_sheets_per_book / n_up)
    cover_cost = cover_sheets * cps(cover)
    inside_cost = inside_sheets * cps(inside)
    print_cost = (cover_sheets + inside_sheets) * settings["click_4_4"]
    lam = cover_sheets * settings["lamination_per_sheet"] if body.laminate_cover else 0
    binding_flat = {"saddle": settings["binding_saddle"], "spiral": settings["binding_spiral"],
                    "wireo": settings["binding_wireo"], "perfect": settings["binding_perfect"]}.get(body.binding, 0)
    binding_cost = body.quantity * (binding_flat + body.page_count * settings["binding_per_page"])
    base = cover_cost + inside_cost + print_cost + lam + binding_cost
    return {
        "cover": cover, "inside": inside, "cover_sheets": cover_sheets, "inside_sheets": inside_sheets,
        "cover_cost": round(cover_cost, 2), "inside_cost": round(inside_cost, 2),
        "print_cost": round(print_cost, 2), "lamination": round(lam, 2),
        "binding_cost": round(binding_cost, 2), "total_cost": round(base, 2),
        "customer_price": markup_price(base, settings["retail_markup_pct"]),
        "wholesale_price": markup_price(base, settings["wholesale_markup_pct"]),
        "unit_price": round(markup_price(base, settings["retail_markup_pct"]) / body.quantity, 2),
    }

class LFSize(BaseModel):
    width: float
    height: float
    qty: int = 1

class LFCalcIn(BaseModel):
    sizes: List[LFSize]
    mode: str = "print"
    laminate: bool = False
    material_ids: Optional[List[str]] = None

@api_router.post("/calc/largeformat")
async def calc_lf(body: LFCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    q = {"_id": {"$in": [ObjectId(m) for m in body.material_ids]}} if body.material_ids else {}
    mats = [clean(m) for m in await db.roll_materials.find(q).to_list(200)]
    results = []
    for m in mats:
        size_rows = []
        total = {"material_cost": 0, "printing_cost": 0, "extra_cost": 0, "selling_price": 0, "wholesale_price": 0}
        for s in body.sizes:
            est = lf_estimate(m, settings, s.width, s.height, s.qty, body.mode, body.laminate)
            est["width"] = s.width
            est["height"] = s.height
            est["qty"] = s.qty
            size_rows.append(est)
            for k in total:
                total[k] += est[k]
        total = {k: round(v, 2) for k, v in total.items()}
        results.append({"material": m, "sizes": size_rows, "total": total})
    results.sort(key=lambda r: r["total"]["selling_price"])
    return {"results": results, "mode": body.mode}

class StickerCalcIn(BaseModel):
    width: float = 3.0
    height: float = 3.0
    qty: int = 100

@api_router.post("/calc/sticker")
async def calc_sticker(body: StickerCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    mats = [clean(m) for m in await db.roll_materials.find({"sticker_compatible": True}).to_list(200)]
    results = []
    for m in mats:
        est = lf_estimate(m, settings, body.width, body.height, body.qty, "print_diecut", False)
        est["width"] = body.width
        est["height"] = body.height
        est["qty"] = body.qty
        est["unit_price"] = round(est["selling_price"] / body.qty, 3) if body.qty else 0
        results.append(est)
    results.sort(key=lambda r: r["selling_price"])
    return {"results": results}

@api_router.get("/calc/equipment/{eq_id}")
async def calc_equipment(eq_id: str, user=Depends(get_current_user)):
    eq = await db.equipment.find_one({"_id": ObjectId(eq_id)})
    if not eq:
        raise HTTPException(404, "Not found")
    eq = clean(eq)
    return {"equipment": eq, "cost": equipment_cost(eq)}

@api_router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    return {
        "paper_stocks": await db.paper_stocks.count_documents({}),
        "products": await db.products.count_documents({}),
        "roll_materials": await db.roll_materials.count_documents({}),
        "equipment": await db.equipment.count_documents({}),
        "sticker_materials": await db.roll_materials.count_documents({"sticker_compatible": True}),
        "size_presets": await db.size_presets.count_documents({}),
    }

@api_router.get("/")
async def root():
    return {"message": "Print and Save ERP API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@printandsave.ca").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"email": admin_email, "password_hash": hash_password(admin_pw),
                                   "name": "Admin", "role": "admin", "created_at": now_iso()})
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    await get_settings()
    await seed_demo()

async def seed_demo():
    if await db.paper_stocks.count_documents({}) == 0:
        stocks = [
            {"name": "80lb Gloss Cover", "size": "13x19", "sheets_per_box": 500, "cost_per_box": 95.0},
            {"name": "100lb Gloss Text", "size": "13x19", "sheets_per_box": 500, "cost_per_box": 75.0},
            {"name": "14pt C2S Cover", "size": "13x19", "sheets_per_box": 250, "cost_per_box": 110.0},
            {"name": "70lb Uncoated Text", "size": "13x19", "sheets_per_box": 500, "cost_per_box": 55.0},
        ]
        for s in stocks:
            s["cost_per_sheet"] = round(s["cost_per_box"] / s["sheets_per_box"], 4)
            s["created_at"] = now_iso()
        await db.paper_stocks.insert_many(stocks)
    if await db.products.count_documents({}) == 0:
        prods = [
            {"name": "Business Card", "finished_w": 3.5, "finished_h": 2.0, "bleed_w": 3.75, "bleed_h": 2.25},
            {"name": "Postcard 4x6", "finished_w": 6.0, "finished_h": 4.0, "bleed_w": 6.25, "bleed_h": 4.25},
            {"name": "Flyer 8.5x11", "finished_w": 8.5, "finished_h": 11.0, "bleed_w": 8.75, "bleed_h": 11.25},
        ]
        for p in prods:
            p["created_at"] = now_iso()
        await db.products.insert_many(prods)
    if await db.roll_materials.count_documents({}) == 0:
        mats = [
            {"name": "Glossy Vinyl", "code": "VNL-G", "roll_width": 54, "printable_width": 52, "price_per_sqft": 0.85, "min_linear_feet": 1, "sticker_compatible": True, "material_type": "vinyl"},
            {"name": "Matte Vinyl", "code": "VNL-M", "roll_width": 54, "printable_width": 52, "price_per_sqft": 0.90, "min_linear_feet": 1, "sticker_compatible": True, "material_type": "vinyl"},
            {"name": "Banner 13oz", "code": "BNR-13", "roll_width": 60, "printable_width": 58, "price_per_sqft": 0.65, "min_linear_feet": 1, "sticker_compatible": False, "material_type": "banner"},
            {"name": "Holographic", "code": "HOLO", "roll_width": 51, "printable_width": 49, "price_per_sqft": 1.75, "min_linear_feet": 1, "sticker_compatible": True, "material_type": "specialty"},
        ]
        for m in mats:
            m["created_at"] = now_iso()
        await db.roll_materials.insert_many(mats)
    if await db.equipment.count_documents({}) == 0:
        eqs = [
            {"name": "Ricoh Pro C7200", "ink_config": "CMYK", "cartridge_ml": 500, "ink_price": 180.0, "ink_consumption_ml_sqft": 0.4, "maintenance_pct": 6.0},
            {"name": "Roland TrueVIS", "ink_config": "CMYK + Wh", "cartridge_ml": 500, "ink_price": 220.0, "ink_consumption_ml_sqft": 0.6, "maintenance_pct": 8.0},
        ]
        for e in eqs:
            e["created_at"] = now_iso()
        await db.equipment.insert_many(eqs)
    if await db.size_presets.count_documents({}) == 0:
        presets = [
            {"name": "Yard Sign 24x18", "width": 24, "height": 18, "created_at": now_iso()},
            {"name": "Banner 96x36", "width": 96, "height": 36, "created_at": now_iso()},
            {"name": "Decal 12x12", "width": 12, "height": 12, "created_at": now_iso()},
        ]
        await db.size_presets.insert_many(presets)

@app.on_event("shutdown")
async def shutdown():
    client.close()
