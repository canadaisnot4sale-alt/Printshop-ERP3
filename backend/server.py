from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Form, File, UploadFile, Header, Query
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
import httpx
import stripe
import uuid
import requests

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "printandsave"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 403:
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def storage_get(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
              "webp": "image/webp", "pdf": "application/pdf", "csv": "text/csv", "txt": "text/plain"}

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

async def require_admin(user=Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

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
    linked_material_id: Optional[str] = None

class Product(BaseModel):
    name: str
    finished_w: float
    finished_h: float
    bleed_w: Optional[float] = None
    bleed_h: Optional[float] = None
    gutter: float = 0.0
    retail_markup_pct: Optional[float] = None
    wholesale_markup_pct: Optional[float] = None
    notes: str = ""

class RollMaterial(BaseModel):
    name: str
    code: str = ""
    roll_width: float = 54.0
    printable_width: float = 52.0
    price_per_sqft: float = 0.0
    min_linear_feet: float = 1.0
    sticker_compatible: bool = False
    material_type: str = "vinyl"
    linked_material_id: Optional[str] = None

class Equipment(BaseModel):
    name: str
    module: str = "general"
    ink_config: str = "CMYK"
    cartridge_ml: float = 220
    ink_price: float = 0.0
    ink_consumption_ml_sqft: float = 0.5
    maintenance_pct: float = 5.0

class EquipmentSupply(BaseModel):
    equipment_id: str
    name: str
    supplier: str = ""
    part_number: str = ""
    description: str = ""
    price: float = 0.0
    purchase_date: str = ""
    install_date: str = ""

class SublimationProduct(BaseModel):
    name: str
    category: str = "mug"
    model: str = ""
    price_per_box: float = 0.0
    pieces_per_box: float = 1
    cost_per_unit: float = 0.0
    uses_paper: bool = False
    print_bleed_w: float = 0.0
    print_bleed_h: float = 0.0

class RollStickerMaterial(BaseModel):
    name: str
    paper_type: str = "gloss"
    roll_cost: float = 0.0
    pieces_per_roll: float = 1000
    roll_width: float = 4.0
    sticker_w: float = 3.0
    sticker_h: float = 3.0
    linked_material_id: Optional[str] = None

class SizePreset(BaseModel):
    name: str
    width: float
    height: float

class Garment(BaseModel):
    name: str
    category: str = "tshirt"
    cost_each: float = 0.0

class LaserMaterial(BaseModel):
    name: str
    sheet_width: float = 24.0
    sheet_height: float = 18.0
    cost_per_sheet: float = 0.0
    linked_material_id: Optional[str] = None

class SheetMaterial(BaseModel):
    name: str
    code: str = ""
    price_per_sqft: float = 0.0
    inks: str = "CMYK"
    cnc_capable: bool = True
    channel_capable: bool = False
    linked_material_id: Optional[str] = None

MATERIAL_MODULES = ["paper", "booklet", "large-format", "stickers", "dtf", "embroidery",
                    "laser", "direct-print", "channel-letters", "sublimation", "roll-stickers"]

class Material(BaseModel):
    name: str                                   # nickname / display name
    code: str = ""
    category: str = "sheet"                     # sheet, roll, ink, laminate, substrate, other
    # Supplier info
    supplier_company: str = ""
    supplier_contact: str = ""
    supplier_phone: str = ""
    supplier_email: str = ""
    # Specs
    unit: str = "sheet"                         # sheet, sqft, roll, each
    size: str = ""                              # e.g. 4x8 ft, 13x19 in
    weight: str = ""
    gramage: str = ""
    sheet_area_sqft: float = 0.0                # used to compute ink cost for finish cost
    # Economics
    unit_cost: float = 0.0                       # cost per unit
    labor_minutes: float = 0.0                   # labor to finish one unit
    machine_id: Optional[str] = None             # machine that fabricates (ink + hourly)
    ink_coverage_pct: float = 0.0
    price_override: Optional[float] = None       # manual RETAIL price
    wholesale_price_override: Optional[float] = None  # manual WHOLESALE price
    retail_markup_pct: Optional[float] = None    # per-material override
    wholesale_markup_pct: Optional[float] = None
    modules: List[str] = []                      # cross-module usage flags
    is_default: bool = False                     # (legacy) default material for its category
    default_modules: List[str] = []              # modules where THIS is the default material
    # Module-specific specs (optional; shown per assigned module)
    sheet_width: float = 0.0                      # paper/laser sheet imposition (inches)
    sheet_height: float = 0.0
    sheets_per_box: float = 0.0                   # paper cost helper
    num_boxes: float = 0.0                        # paper: boxes on hand (stock = num_boxes * sheets_per_box)
    price_per_box: float = 0.0                    # paper: box price (unit_cost = price_per_box / sheets_per_box)
    click_cost: float = 0.055                     # paper: press click cost per printed side
    roll_cost: float = 0.0                        # roll: price of one full roll
    roll_qty: float = 0.0                          # roll: number of rolls on hand
    printable_height: float = 0.0                  # roll: usable printable length (inches) for layout
    waste_linear_ft: float = 0.0                   # roll: linear feet (across width) wasted per order
    color: str = ""                                # substrate color/finish
    sheet_price: float = 0.0                       # substrate: price per full sheet
    sheet_qty: float = 0.0                         # substrate: sheets on hand
    roll_width: float = 0.0                       # large-format / roll-stickers
    printable_width: float = 0.0
    min_linear_feet: float = 1.0
    material_type: str = ""                       # vinyl, banner, etc.
    sticker_compatible: bool = False
    cnc_capable: bool = True                       # direct-print
    channel_capable: bool = False                  # channel-letters
    pieces_per_roll: float = 0.0                   # roll-stickers
    sticker_w: float = 0.0
    sticker_h: float = 0.0
    # Inventory
    stock_qty: float = 0.0
    reorder_point: float = 0.0
    reorder_target: float = 0.0
    waste_per_order: float = 0.0                  # stock wasted once per order this material is used in
    notes: str = ""

class StockAdjust(BaseModel):
    delta: float
    reason: str = ""

class ReorderEmailIn(BaseModel):
    recipient_email: EmailStr
    subject: str
    body_html: str
    material_ids: List[str] = []

class JobPreset(BaseModel):
    name: str
    module: str = "generic"
    sizes: List[dict] = []

class LaserPreset(BaseModel):
    name: str
    material: str = ""
    power: float = 100.0
    speed: float = 100.0
    time_min: float = 0.0
    thickness: float = 0.125
    passes: int = 1
    sizes: List[dict] = []

class Machine(BaseModel):
    name: str
    category: str = "largeformat"   # largeformat, directprint, laser, laserprint, finishing, other
    acquisition: str = "owned"      # owned | leased
    purchase_price: float = 0.0
    lease_monthly: float = 0.0
    lease_term_months: float = 48.0
    useful_life_years: float = 7.0
    maintenance_pct_year: float = 2.0
    productive_hours_month: float = 0.0   # 0 => use settings.open_hours_per_month
    ink_config: str = ""
    ink_details: str = ""
    ink_ml_per_sqft_full: float = 10.0     # ml consumed per ft² at 100% full-color coverage (calibratable)
    ink_cost_per_ml: float = 0.25
    ink_full_ref_density: float = 0.55     # avg CMYK density that maps to "100% full color" in file analysis
    notes: str = ""

class FixedCost(BaseModel):
    label: str
    category: str = "overhead"      # rent, payroll, utilities, misc, overhead
    amount: float = 0.0             # per month
    notes: str = ""

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
    # DTF / apparel
    dtf_per_sqft: float = 4.50
    dtf_labor_per_shirt: float = 3.00
    # Embroidery
    embroidery_per_1000_stitches: float = 1.20
    embroidery_digitizing_setup: float = 25.0
    # Laser
    laser_cut_per_linear_ft: float = 1.50
    laser_engraving_per_sqin: float = 0.15
    laser_setup: float = 10.0
    # Direct print (UV) & CNC
    directprint_per_sqft: float = 2.50
    cnc_cut_per_linear_ft: float = 2.00
    # Channel letters
    channel_letter_width_ratio: float = 0.7
    channel_return_depth_in: float = 4.0
    channel_letter_labor: float = 12.0
    channel_fixture_margin_in: float = 1.0
    # Sticker finishing
    sticker_laminate_per_sqft: float = 0.75
    sticker_kisscut_per_sqft: float = 0.40
    sticker_diecut_per_sqft: float = 0.90
    sticker_individual_cut_per_piece: float = 0.10
    # DTF apparel roll
    dtf_roll_width: float = 12.0
    dtf_gutter_in: float = 0.25
    # Embroidery digitizing (1-3 logos, optional)
    embroidery_digitizing_1_3: float = 69.0
    # Sublimation (SureColor F570)
    sublimation_paper_width: float = 24.0
    sublimation_paper_length_ft: float = 150.0
    sublimation_paper_roll_cost: float = 45.0
    sublimation_ink_per_sqft: float = 0.30
    sublimation_labor_per_unit: float = 1.0
    # Roll stickers (Epson ColorWorks C6000A)
    rollsticker_waste_pieces: float = 5.0
    rollsticker_cleaning_cost: float = 1.50
    rollsticker_ink_per_sticker: float = 0.01
    rollsticker_labor: float = 5.0
    rollsticker_stickers_per_min: float = 30.0
    currency: str = "CAD"
    # Business finance (BC, Canada)
    gst_pct: float = 5.0
    pst_pct: float = 7.0
    open_hours_per_month: float = 188.0
    default_maintenance_pct_year: float = 2.0
    owner_salary_monthly: float = 0.0
    technician_hourly_rate: float = 65.0

SHEET_SIZES = {
    "8.5x11": (8.5, 11), "8.5x14": (8.5, 14), "11x17": (11, 17),
    "12x18": (12, 18), "13x19": (13, 19),
}
BIG_SHEETS = {"4x8": (48, 96), "5x10": (60, 120)}
CHANNEL_HEIGHTS = [6, 12, 16, 18, 22, 24, 36, 48]
STANDARD_QTYS = [25, 50, 100, 250, 500, 1000, 2500, 5000]

# ---------------- Settings helpers ----------------
async def get_settings() -> dict:
    defaults = Settings().model_dump()
    s = await db.settings.find_one({"_key": "global"})
    if not s:
        d = dict(defaults)
        d["_key"] = "global"
        await db.settings.insert_one(d)
        s = d
    s = dict(s)
    s.pop("_id", None)
    s.pop("_key", None)
    # backfill any new default keys added after the doc was created
    missing = {k: v for k, v in defaults.items() if k not in s}
    if missing:
        await db.settings.update_one({"_key": "global"}, {"$set": missing})
        s.update(missing)
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

# Role-based field visibility (single shared workspace + RBAC + field-level)
COST_FIELDS = {
    "material_cost", "cost_4_0", "cost_4_4", "lamination", "printing_cost", "extra_cost",
    "cover_cost", "inside_cost", "print_cost", "binding_cost", "total_cost", "cost_per_sheet",
    "cost_per_box", "price_per_sqft", "cost_each", "dtf_cost", "garment_cost", "labor",
    "embroidery_cost", "setup", "cut_cost", "engrave_cost", "cnc_cost", "face_cost",
    "return_cost", "sheet_cost", "base_cost", "ink_cost", "blank_cost",
}
RETAIL_FIELDS = {
    "customer_price", "customer_price_4_0", "customer_price_4_4", "selling_price",
    "unit_price", "retail_price", "retail_total",
}
WHOLESALE_FIELDS = {
    "wholesale_price", "wholesale_price_4_0", "wholesale_price_4_4", "wholesale_total",
    "wholesale_unit",
}

def scrub(data, role):
    if role == "admin":
        return data
    def strip(key):
        if key in COST_FIELDS or "cost" in key:
            return True
        if role == "reseller":
            return "retail" in key or "customer" in key or key in ("selling_price", "unit_price")
        return "wholesale" in key
    def walk(o):
        if isinstance(o, dict):
            return {k: walk(v) for k, v in o.items() if not strip(k)}
        if isinstance(o, list):
            return [walk(x) for x in o]
        return o
    return walk(data)

def nest_pieces(items, bin_width, max_rects=400):
    """Shelf (next-fit-decreasing) nesting on a strip of given width.
    items: [{w,h,qty,label}]. Returns (placements, used_length, area_sqft)."""
    rects = []
    for it in items:
        w = float(it.get("w", 0)); h = float(it.get("h", 0))
        qty = int(it.get("qty", 1) or 1)
        label = it.get("label", "")
        for _ in range(qty):
            rects.append({"w": w, "h": h, "label": label})
            if len(rects) >= max_rects:
                break
    # orient each piece so it fits within bin_width when possible
    for r in rects:
        if r["w"] > bin_width and r["h"] <= bin_width:
            r["w"], r["h"] = r["h"], r["w"]
    rects.sort(key=lambda r: -r["h"])
    placed = []
    x = 0.0; y = 0.0; shelf_h = 0.0
    for r in rects:
        if x + r["w"] > bin_width + 1e-6 and x > 0:
            y += shelf_h; x = 0.0; shelf_h = 0.0
        placed.append({"x": round(x, 2), "y": round(y, 2), "w": round(r["w"], 2), "h": round(r["h"], 2), "label": r["label"]})
        x += r["w"]; shelf_h = max(shelf_h, r["h"])
    used_length = round(y + shelf_h, 2)
    area_sqft = round(bin_width * used_length / 144.0, 3)
    return placed, used_length, area_sqft

def grid_layout(SW, SH, w, h, gutter=0.0):
    best = None
    for pw, ph, rot in [(w, h, False), (h, w, True)]:
        cols = int((SW + gutter) // (pw + gutter)) if (pw + gutter) > 0 else 0
        rows = int((SH + gutter) // (ph + gutter)) if (ph + gutter) > 0 else 0
        n = cols * rows
        if best is None or n > best["n"]:
            placements = []
            for r in range(rows):
                for c in range(cols):
                    placements.append({"x": round(c * (pw + gutter), 2), "y": round(r * (ph + gutter), 2),
                                       "w": round(pw, 2), "h": round(ph, 2)})
            best = {"n": n, "cols": cols, "rows": rows, "rotated": rot, "pw": pw, "ph": ph, "placements": placements}
    return best

def paper_quote(product, stock, settings, qtys, laminate=False, sheet_key="13x19"):
    sw, sh = SHEET_SIZES.get(sheet_key, (13, 19))
    pw = product.get("bleed_w") or product["finished_w"]
    ph = product.get("bleed_h") or product["finished_h"]
    gutter = product.get("gutter") or 0.0
    gl = grid_layout(sw, sh, pw, ph, gutter)
    n_up = gl["n"]
    retail_pct = product.get("retail_markup_pct")
    retail_pct = retail_pct if retail_pct not in (None, "") else settings["retail_markup_pct"]
    whole_pct = product.get("wholesale_markup_pct")
    whole_pct = whole_pct if whole_pct not in (None, "") else settings["wholesale_markup_pct"]
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
            "base_cost_4_0": round(base_40, 2), "base_cost_4_4": round(base_44, 2),
            "unit_cost_4_0": round(base_40 / q, 4) if q else 0,
            "unit_cost_4_4": round(base_44 / q, 4) if q else 0,
            "customer_price_4_0": markup_price(base_40, retail_pct),
            "customer_price_4_4": markup_price(base_44, retail_pct),
            "wholesale_price_4_0": markup_price(base_40, whole_pct),
            "wholesale_price_4_4": markup_price(base_44, whole_pct),
            "retail_unit_4_0": round(markup_price(base_40, retail_pct) / q, 4) if q else 0,
            "retail_unit_4_4": round(markup_price(base_44, retail_pct) / q, 4) if q else 0,
            "wholesale_unit_4_0": round(markup_price(base_40, whole_pct) / q, 4) if q else 0,
            "wholesale_unit_4_4": round(markup_price(base_44, whole_pct) / q, 4) if q else 0,
        })
    layout = {"bin_width": sw, "used_length": sh, "placements": gl["placements"], "rotated": gl["rotated"], "gutter": gutter}
    return {"n_up": n_up, "sheet": sheet_key, "cost_per_sheet": round(cps, 4), "rows": rows, "layout": layout,
            "rotated": gl["rotated"], "piece_w": round(gl["pw"], 2), "piece_h": round(gl["ph"], 2)}

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
           "name": body.name, "role": "client", "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": {"id": uid, "email": email, "name": body.name, "role": "client"}}

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
        items = [clean(i) for i in items]
        return items

    @api_router.post(f"/{path}")
    async def create_item(body: model, user=Depends(require_admin)):
        doc = body.model_dump()
        if transform:
            transform(doc)
        doc["created_at"] = now_iso()
        res = await coll.insert_one(doc)
        doc["_id"] = res.inserted_id
        return clean(doc)

    @api_router.put(f"/{path}/{{item_id}}")
    async def update_item(item_id: str, body: model, user=Depends(require_admin)):
        doc = body.model_dump()
        if transform:
            transform(doc)
        await coll.update_one({"_id": ObjectId(item_id)}, {"$set": doc})
        updated = await coll.find_one({"_id": ObjectId(item_id)})
        return clean(updated)

    @api_router.delete(f"/{path}/{{item_id}}")
    async def delete_item(item_id: str, user=Depends(require_admin)):
        await coll.delete_one({"_id": ObjectId(item_id)})
        return {"ok": True}

def paper_transform(doc):
    if not doc.get("cost_per_sheet") and doc.get("sheets_per_box"):
        doc["cost_per_sheet"] = round(doc["cost_per_box"] / doc["sheets_per_box"], 4)

register_crud("products", Product, "products")
register_crud("equipment", Equipment, "equipment")
register_crud("size-presets", SizePreset, "size_presets")
register_crud("garments", Garment, "garments")
register_crud("sublimation-products", SublimationProduct, "sublimation_products")

# ---------------- Unified Materials: single source of truth for all module materials ----------------
# Each legacy per-module material endpoint now READS from the central `materials` collection
# (filtered by assigned modules) and maps to the shape each calculator expects. Editing is
# done ONLY from the central Materials page; per-module writes are blocked.
COLLECTION_MODULES = {
    "paper_stocks": ["paper", "booklet"],
    "roll_materials": ["large-format", "stickers"],
    "laser_materials": ["laser"],
    "sheet_materials": ["direct-print", "channel-letters"],
    "roll_sticker_materials": ["roll-stickers"],
}

def map_material(collection, m, default_module=None):
    """Map a central Material doc into the legacy per-module shape used by calculators."""
    uc = m.get("unit_cost") or 0
    is_def = bool(default_module and default_module in (m.get("default_modules") or []))
    base = {"id": m.get("id"), "name": m.get("name"), "code": m.get("code", ""),
            "unit_cost": uc, "unit": m.get("unit"), "stock_qty": m.get("stock_qty", 0),
            "linked_material_id": m.get("id"), "linked_material_name": m.get("name"),
            "linked_stock_qty": m.get("stock_qty", 0), "modules": m.get("modules", []),
            "is_default": is_def, "default_modules": m.get("default_modules", [])}
    if collection == "paper_stocks":
        spb = m.get("sheets_per_box") or 500
        base.update({"cost_per_sheet": uc, "sheets_per_box": spb,
                     "cost_per_box": round(uc * spb, 2), "size": m.get("size", "")})
    elif collection == "roll_materials":
        base.update({"price_per_sqft": uc, "roll_width": m.get("roll_width") or 54.0,
                     "printable_width": m.get("printable_width") or (m.get("roll_width") or 54.0) - 2,
                     "min_linear_feet": m.get("min_linear_feet") or 1.0,
                     "sticker_compatible": bool(m.get("sticker_compatible")),
                     "material_type": m.get("material_type") or "vinyl"})
    elif collection == "laser_materials":
        base.update({"cost_per_sheet": uc, "sheet_width": m.get("sheet_width") or 24.0,
                     "sheet_height": m.get("sheet_height") or 18.0})
    elif collection == "sheet_materials":
        base.update({"price_per_sqft": uc, "inks": "CMYK",
                     "cnc_capable": bool(m.get("cnc_capable", True)),
                     "channel_capable": bool(m.get("channel_capable"))})
    elif collection == "roll_sticker_materials":
        base.update({"roll_cost": uc, "pieces_per_roll": m.get("pieces_per_roll") or 1000,
                     "roll_width": m.get("roll_width") or 4.0,
                     "sticker_w": m.get("sticker_w") or 3.0, "sticker_h": m.get("sticker_h") or 3.0})
    return base

async def materials_for_collection(collection, extra_filter=None, module=None):
    modules = COLLECTION_MODULES[collection]
    q = {"modules": {"$in": modules}}
    if extra_filter:
        q.update(extra_filter)
    docs = [clean(d) for d in await db.materials.find(q).sort("name", 1).to_list(500)]
    out = [map_material(collection, d, module) for d in docs]
    out.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return out

async def material_by_id(collection, mid, module=None):
    try:
        d = await db.materials.find_one({"_id": ObjectId(mid)})
    except Exception:
        d = None
    return map_material(collection, clean(d), module) if d else None

async def materials_by_ids(collection, ids, module=None):
    oids = []
    for i in (ids or []):
        try:
            oids.append(ObjectId(i))
        except Exception:
            pass
    q = {"modules": {"$in": COLLECTION_MODULES[collection]}}
    if oids:
        q["_id"] = {"$in": oids}
    docs = [clean(d) for d in await db.materials.find(q).sort("name", 1).to_list(500)]
    out = [map_material(collection, d, module) for d in docs]
    out.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return out

MODULE_FOR_COLLECTION = {
    "paper_stocks": "paper", "roll_materials": "large-format", "laser_materials": "laser",
    "sheet_materials": "direct-print", "roll_sticker_materials": "roll-stickers",
}

def register_material_view(path, collection):
    @api_router.get(f"/{path}")
    async def list_material_view(module: str = None, user=Depends(get_current_user)):
        return await materials_for_collection(collection, module=module or MODULE_FOR_COLLECTION.get(collection))

    @api_router.post(f"/{path}")
    async def blocked_create(user=Depends(require_admin)):
        raise HTTPException(400, "Materials are managed from the central Materials page.")

    @api_router.put(f"/{path}/{{item_id}}")
    async def blocked_update(item_id: str, user=Depends(require_admin)):
        raise HTTPException(400, "Materials are managed from the central Materials page.")

    @api_router.delete(f"/{path}/{{item_id}}")
    async def blocked_delete(item_id: str, user=Depends(require_admin)):
        raise HTTPException(400, "Materials are managed from the central Materials page.")

register_material_view("paper-stocks", "paper_stocks")
register_material_view("roll-materials", "roll_materials")
register_material_view("laser-materials", "laser_materials")
register_material_view("sheet-materials", "sheet_materials")
register_material_view("roll-sticker-materials", "roll_sticker_materials")

def paper_transform(doc):
    pass

# ---------------- Business finance: machines + fixed costs + summary ----------------
def machine_computed(m, open_hours):
    owned = m.get("acquisition") == "owned"
    value = (m.get("purchase_price") or 0) or ((m.get("lease_monthly") or 0) * (m.get("lease_term_months") or 0))
    maint_m = value * ((m.get("maintenance_pct_year") or 0) / 100.0) / 12.0
    life_m = max((m.get("useful_life_years") or 0) * 12.0, 1)
    if owned:
        recurring = (m.get("purchase_price") or 0) / life_m
    else:
        recurring = m.get("lease_monthly") or 0
    monthly = recurring + maint_m
    hrs = (m.get("productive_hours_month") or 0) or open_hours or 1
    return {
        "value": round(value, 2),
        "maintenance_monthly": round(maint_m, 2),
        "recurring_monthly": round(recurring, 2),
        "monthly_cost": round(monthly, 2),
        "hourly_cost": round(monthly / hrs, 2),
        "productive_hours": round(hrs, 1),
    }

@api_router.get("/machines")
async def list_machines(user=Depends(require_admin)):
    s = await get_settings()
    oh = s.get("open_hours_per_month", 188) or 188
    items = await db.machines.find().sort("created_at", -1).to_list(500)
    out = []
    for m in items:
        c = clean(m)
        c.update(machine_computed(c, oh))
        out.append(c)
    return out

@api_router.post("/machines")
async def create_machine(body: Machine, user=Depends(require_admin)):
    doc = body.model_dump(); doc["created_at"] = now_iso()
    res = await db.machines.insert_one(doc); doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.put("/machines/{mid}")
async def update_machine(mid: str, body: Machine, user=Depends(require_admin)):
    await db.machines.update_one({"_id": ObjectId(mid)}, {"$set": body.model_dump()})
    return clean(await db.machines.find_one({"_id": ObjectId(mid)}))

@api_router.delete("/machines/{mid}")
async def delete_machine(mid: str, user=Depends(require_admin)):
    await db.machines.delete_one({"_id": ObjectId(mid)})
    return {"ok": True}

# ---------------- File uploads (invoices) ----------------
@api_router.post("/upload/invoice")
async def upload_invoice(file: UploadFile = File(...), user=Depends(require_admin)):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin")
    ctype = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    path = f"{APP_NAME}/invoices/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 15MB).")
    result = storage_put(path, data, ctype)
    fid = str(uuid.uuid4())
    await db.files.insert_one({
        "id": fid, "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ctype, "size": result.get("size", len(data)),
        "is_deleted": False, "created_at": now_iso(),
    })
    return {"file_id": fid, "filename": file.filename,
            "url": f"/api/files/{fid}/download", "size": result.get("size", len(data))}

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, authorization: str = Header(None), auth: str = Query(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid token")
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ctype = storage_get(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ctype),
                    headers={"Content-Disposition": f'inline; filename="{rec.get("original_filename","file")}"'})

# ---------------- Machine maintenance logs ----------------
LOG_TYPES = ["service", "part", "cleaning", "repair", "other"]

class MachineLog(BaseModel):
    machine_id: str = ""
    type: str = "service"                 # service | part | cleaning | repair | other
    title: str = ""
    description: str = ""
    supplier: str = ""
    part_number: str = ""
    cost: float = 0.0
    date: str = ""                        # ISO date (YYYY-MM-DD)
    cleaning_minutes: float = 0.0
    cleaning_rate: float = 0.0            # $/hr used for this cleaning entry
    invoice_file_id: str = ""
    invoice_filename: str = ""

def _log_total(doc: dict) -> float:
    if doc.get("type") == "cleaning":
        return round((doc.get("cleaning_minutes") or 0) / 60.0 * (doc.get("cleaning_rate") or 0), 2)
    return round(doc.get("cost") or 0.0, 2)

def _enrich_log(doc: dict) -> dict:
    c = clean(doc)
    c["total"] = _log_total(c)
    if c.get("invoice_file_id"):
        c["invoice_url"] = f"/api/files/{c['invoice_file_id']}/download"
    return c

@api_router.get("/machines/{mid}/logs")
async def list_machine_logs(mid: str, user=Depends(require_admin)):
    items = await db.machine_logs.find({"machine_id": mid, "is_deleted": {"$ne": True}}).sort("date", -1).to_list(1000)
    return [_enrich_log(i) for i in items]

@api_router.post("/machines/{mid}/logs")
async def create_machine_log(mid: str, body: MachineLog, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["machine_id"] = mid
    doc["date"] = doc.get("date") or now_iso()[:10]
    doc["is_deleted"] = False
    doc["created_at"] = now_iso()
    res = await db.machine_logs.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _enrich_log(doc)

@api_router.delete("/machine-logs/{log_id}")
async def delete_machine_log(log_id: str, user=Depends(require_admin)):
    await db.machine_logs.update_one({"_id": ObjectId(log_id)}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------------- Machine maintenance schedules (recurring parts) ----------------
class MachineSchedule(BaseModel):
    machine_id: str = ""
    part_name: str
    recurring: bool = True
    interval_months: int = 3              # used only when recurring
    last_done: str = ""                   # ISO date
    next_due: str = ""                    # used for one-time (recurring=false)
    est_cost: float = 0.0
    notes: str = ""

def _add_months(date_str: str, months: int) -> str:
    try:
        d = datetime.fromisoformat(date_str[:10])
    except Exception:
        return ""
    m = d.month - 1 + months
    y = d.year + m // 12
    mo = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1])
    return datetime(y, mo, day).date().isoformat()

def _schedule_status(sch: dict) -> dict:
    c = clean(sch)
    if c.get("recurring"):
        nd = _add_months(c.get("last_done", ""), int(c.get("interval_months") or 0)) if c.get("last_done") else ""
    else:
        nd = c.get("next_due", "")
    c["computed_next_due"] = nd
    today = datetime.now(timezone.utc).date()
    status = "ok"
    days = None
    if nd:
        try:
            due = datetime.fromisoformat(nd).date()
            days = (due - today).days
            if days < 0:
                status = "overdue"
            elif days <= 14:
                status = "due-soon"
        except Exception:
            pass
    c["days_until_due"] = days
    c["status"] = status
    return c

@api_router.get("/machines/{mid}/schedules")
async def list_machine_schedules(mid: str, user=Depends(require_admin)):
    items = await db.machine_schedules.find({"machine_id": mid, "is_deleted": {"$ne": True}}).to_list(500)
    return [_schedule_status(i) for i in items]

@api_router.post("/machines/{mid}/schedules")
async def create_machine_schedule(mid: str, body: MachineSchedule, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["machine_id"] = mid
    doc["is_deleted"] = False
    doc["created_at"] = now_iso()
    res = await db.machine_schedules.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _schedule_status(doc)

@api_router.put("/machine-schedules/{sid}")
async def update_machine_schedule(sid: str, body: MachineSchedule, user=Depends(require_admin)):
    await db.machine_schedules.update_one({"_id": ObjectId(sid)}, {"$set": body.model_dump()})
    return _schedule_status(await db.machine_schedules.find_one({"_id": ObjectId(sid)}))

@api_router.delete("/machine-schedules/{sid}")
async def delete_machine_schedule(sid: str, user=Depends(require_admin)):
    await db.machine_schedules.update_one({"_id": ObjectId(sid)}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------------- Maintenance alerts + tax report ----------------
@api_router.get("/machines/maintenance/alerts")
async def maintenance_alerts(user=Depends(require_admin)):
    scheds = await db.machine_schedules.find({"is_deleted": {"$ne": True}}).to_list(1000)
    machines = {str(m["_id"]): m.get("name") for m in await db.machines.find().to_list(500)}
    alerts = []
    for s in scheds:
        st = _schedule_status(s)
        if st["status"] in ("overdue", "due-soon"):
            st["machine_name"] = machines.get(st.get("machine_id"), "—")
            alerts.append(st)
    alerts.sort(key=lambda x: (x["status"] != "overdue", x.get("days_until_due") if x.get("days_until_due") is not None else 9999))
    return {"count": len(alerts), "overdue": sum(1 for a in alerts if a["status"] == "overdue"),
            "due_soon": sum(1 for a in alerts if a["status"] == "due-soon"), "alerts": alerts}

@api_router.get("/machines/maintenance/tax-report")
async def maintenance_tax_report(year: int = None, user=Depends(require_admin)):
    year = year or datetime.now(timezone.utc).year
    machines = {str(m["_id"]): clean(m) for m in await db.machines.find().to_list(500)}
    logs = await db.machine_logs.find({"is_deleted": {"$ne": True}}).to_list(5000)
    per_machine = {}
    grand = 0.0
    by_type = {}
    for l in logs:
        if not (l.get("date", "")[:4] == str(year)):
            continue
        mid = l.get("machine_id")
        amt = _log_total(l)
        grand += amt
        pm = per_machine.setdefault(mid, {"machine_id": mid, "machine_name": machines.get(mid, {}).get("name", "—"),
                                          "total": 0.0, "by_type": {}})
        pm["total"] = round(pm["total"] + amt, 2)
        pm["by_type"][l.get("type", "other")] = round(pm["by_type"].get(l.get("type", "other"), 0) + amt, 2)
        by_type[l.get("type", "other")] = round(by_type.get(l.get("type", "other"), 0) + amt, 2)
    return {"year": year, "grand_total": round(grand, 2), "by_type": by_type,
            "machines": sorted(per_machine.values(), key=lambda x: -x["total"])}


@api_router.get("/fixed-costs")
async def list_fixed_costs(user=Depends(require_admin)):
    items = await db.fixed_costs.find().sort("created_at", -1).to_list(500)
    return [clean(i) for i in items]

@api_router.post("/fixed-costs")
async def create_fixed_cost(body: FixedCost, user=Depends(require_admin)):
    doc = body.model_dump(); doc["created_at"] = now_iso()
    res = await db.fixed_costs.insert_one(doc); doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.put("/fixed-costs/{fid}")
async def update_fixed_cost(fid: str, body: FixedCost, user=Depends(require_admin)):
    await db.fixed_costs.update_one({"_id": ObjectId(fid)}, {"$set": body.model_dump()})
    return clean(await db.fixed_costs.find_one({"_id": ObjectId(fid)}))

@api_router.delete("/fixed-costs/{fid}")
async def delete_fixed_cost(fid: str, user=Depends(require_admin)):
    await db.fixed_costs.delete_one({"_id": ObjectId(fid)})
    return {"ok": True}

# ---------------- Materials: unified DB + inventory + reorder ----------------
async def _business_hourly(s):
    fixed = await db.fixed_costs.find().to_list(500)
    overhead = sum((f.get("amount") or 0) for f in fixed)
    oh = s.get("open_hours_per_month", 188) or 188
    return round(overhead / oh, 2) if oh else 0.0

async def _machines_by_id(s):
    oh = s.get("open_hours_per_month", 188) or 188
    out = {}
    for m in await db.machines.find().to_list(500):
        c = clean(m)
        c.update(machine_computed(c, oh))
        out[c["id"]] = c
    return out

def compute_material(m, biz_hourly, machines_by_id, s):
    """Attach finish cost (material + machine + ink + labor), prices, stock + below-cost flag."""
    unit_cost = m.get("unit_cost") or 0.0
    labor_min = m.get("labor_minutes") or 0.0
    machine = machines_by_id.get(m.get("machine_id")) if m.get("machine_id") else None
    machine_hourly = (machine.get("hourly_cost") or 0.0) if machine else 0.0
    labor_cost = (labor_min / 60.0) * (biz_hourly + machine_hourly)
    ink_cost = 0.0
    area = m.get("sheet_area_sqft") or 0.0
    if machine and area:
        frac = (m.get("ink_coverage_pct") or 0.0) / 100.0
        ml = area * frac * (machine.get("ink_ml_per_sqft_full") or 0.0)
        ink_cost = ml * (machine.get("ink_cost_per_ml") or 0.0)
    finish_cost = round(unit_cost + labor_cost + ink_cost, 4)
    rm = m.get("retail_markup_pct")
    rm = s.get("retail_markup_pct", 200) if rm is None else rm
    wm = m.get("wholesale_markup_pct")
    wm = s.get("wholesale_markup_pct", 100) if wm is None else wm
    retail_price = round(finish_cost * (1 + rm / 100.0), 2)
    wholesale_price = round(finish_cost * (1 + wm / 100.0), 2)
    override = m.get("price_override")
    has_override = override is not None and override > 0
    selling_price = round(override, 2) if has_override else retail_price
    w_override = m.get("wholesale_price_override")
    if w_override is not None and w_override > 0:
        wholesale_price = round(w_override, 2)
    below_cost = bool((has_override and override < finish_cost) or (w_override and w_override < finish_cost))
    stock = m.get("stock_qty") or 0.0
    rp = m.get("reorder_point") or 0.0
    low_stock = stock <= rp
    m.update({
        "labor_cost": round(labor_cost, 4),
        "ink_cost": round(ink_cost, 4),
        "finish_cost": finish_cost,
        "retail_price": retail_price,
        "wholesale_price": wholesale_price,
        "selling_price": selling_price,
        "below_cost": below_cost,
        "low_stock": low_stock,
        "machine_name": machine.get("name") if machine else None,
    })
    return m

@api_router.get("/materials")
async def list_materials(user=Depends(get_current_user)):
    s = await get_settings()
    biz = await _business_hourly(s)
    mbi = await _machines_by_id(s)
    items = [clean(i) for i in await db.materials.find().sort("name", 1).to_list(2000)]
    admin = user.get("role") == "admin"
    out = []
    for m in items:
        compute_material(m, biz, mbi, s)
        if not admin:
            for k in ["unit_cost", "finish_cost", "labor_cost", "ink_cost",
                      "supplier_company", "supplier_contact", "supplier_phone",
                      "supplier_email", "wholesale_price", "below_cost", "stock_qty",
                      "reorder_point", "reorder_target", "low_stock"]:
                m.pop(k, None)
        out.append(m)
    return out

class SupplierPreset(BaseModel):
    company: str
    contact: str = ""
    phone: str = ""
    email: str = ""

@api_router.get("/suppliers")
async def list_suppliers(user=Depends(require_admin)):
    return [clean(s) for s in await db.suppliers.find().sort("company", 1).to_list(500)]

@api_router.post("/suppliers")
async def create_supplier(body: SupplierPreset, user=Depends(require_admin)):
    doc = body.model_dump()
    existing = await db.suppliers.find_one({"company": {"$regex": f"^{doc['company']}$", "$options": "i"}})
    if existing:
        await db.suppliers.update_one({"_id": existing["_id"]}, {"$set": doc})
        return clean(await db.suppliers.find_one({"_id": existing["_id"]}))
    doc["created_at"] = now_iso()
    res = await db.suppliers.insert_one(doc)
    return clean(await db.suppliers.find_one({"_id": res.inserted_id}))

@api_router.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user=Depends(require_admin)):
    await db.suppliers.delete_one({"_id": ObjectId(sid)})
    return {"ok": True}

async def _apply_default_modules(doc_id, default_modules):
    """Ensure only one material is the default per module: unset the given modules from others."""
    for mod in (default_modules or []):
        await db.materials.update_many(
            {"_id": {"$ne": doc_id}, "default_modules": mod},
            {"$pull": {"default_modules": mod}})

@api_router.post("/materials")
async def create_material(body: Material, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["created_at"] = now_iso()
    res = await db.materials.insert_one(doc)
    await _apply_default_modules(res.inserted_id, doc.get("default_modules"))
    s = await get_settings()
    saved = clean(await db.materials.find_one({"_id": res.inserted_id}))
    return compute_material(saved, await _business_hourly(s), await _machines_by_id(s), s)

@api_router.put("/materials/{mid}")
async def update_material(mid: str, body: Material, user=Depends(require_admin)):
    doc = body.model_dump()
    oid = ObjectId(mid)
    await db.materials.update_one({"_id": oid}, {"$set": doc})
    await _apply_default_modules(oid, doc.get("default_modules"))
    s = await get_settings()
    saved = clean(await db.materials.find_one({"_id": oid}))
    return compute_material(saved, await _business_hourly(s), await _machines_by_id(s), s)

@api_router.delete("/materials/{mid}")
async def delete_material(mid: str, user=Depends(require_admin)):
    await db.materials.delete_one({"_id": ObjectId(mid)})
    return {"ok": True}

@api_router.post("/materials/{mid}/adjust-stock")
async def adjust_stock(mid: str, body: StockAdjust, user=Depends(require_admin)):
    m = await db.materials.find_one({"_id": ObjectId(mid)})
    if not m:
        raise HTTPException(404, "Material not found")
    new_qty = max(0.0, (m.get("stock_qty") or 0.0) + body.delta)
    await db.materials.update_one({"_id": ObjectId(mid)}, {"$set": {"stock_qty": new_qty}})
    return {"id": mid, "stock_qty": new_qty, "delta": body.delta}

@api_router.get("/materials/reorder")
async def reorder_center(user=Depends(require_admin)):
    """Group low-stock materials by supplier with suggested reorder qty (target - current)."""
    items = [clean(i) for i in await db.materials.find().to_list(2000)]
    groups = {}
    for m in items:
        stock = m.get("stock_qty") or 0.0
        rp = m.get("reorder_point") or 0.0
        if stock > rp:
            continue
        target = m.get("reorder_target") or 0.0
        suggested = round(max(target - stock, 0.0), 2)
        key = (m.get("supplier_email") or "").lower() or (m.get("supplier_company") or "Unknown supplier")
        g = groups.setdefault(key, {
            "supplier_company": m.get("supplier_company") or "",
            "supplier_contact": m.get("supplier_contact") or "",
            "supplier_email": m.get("supplier_email") or "",
            "supplier_phone": m.get("supplier_phone") or "",
            "items": [],
        })
        g["items"].append({
            "id": m["id"], "name": m.get("name"), "code": m.get("code"),
            "unit": m.get("unit"), "stock_qty": stock, "reorder_point": rp,
            "reorder_target": target, "suggested_qty": suggested,
            "unit_cost": m.get("unit_cost") or 0.0,
        })
    return list(groups.values())

@api_router.post("/materials/reorder/email")
async def reorder_email(body: ReorderEmailIn, user=Depends(require_admin)):
    payload = {
        "to": [body.recipient_email],
        "subject": body.subject,
        "html": body.body_html,
        "from_name": os.environ["EMAIL_FROM_NAME"],
        "contact_email": user["email"],
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Reorder email failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Reorder email error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
    if body.material_ids:
        await db.materials.update_many(
            {"_id": {"$in": [ObjectId(i) for i in body.material_ids]}},
            {"$set": {"reordered_at": now_iso()}})
    return {"status": "success", "message": f"Reorder emailed to {body.recipient_email}"}

# ---------------- Purchases: PDF invoice import + history (tax) ----------------
SUPPLIER_MODULE_RULES = [
    ("alfa", ["paper"], "sheet"),
    ("spicers", ["large-format", "direct-print"], "ink"),
    ("grimco", ["large-format", "direct-print"], "roll"),
]

def suggest_supplier_defaults(company: str):
    c = (company or "").lower()
    for key, mods, cat in SUPPLIER_MODULE_RULES:
        if key in c:
            return mods, cat
    return [], "other"

def extract_pdf_text(raw: bytes) -> str:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(raw)
    parts = []
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        parts.append(tp.get_text_range())
    pdf.close()
    return "\n".join(parts)

INVOICE_SCHEMA_PROMPT = """You are an expert accounts-payable invoice/purchase-order extractor.
Extract the data from the supplier invoice text below and return ONLY valid minified JSON
(no markdown, no commentary) with EXACTLY this shape:
{"supplier":{"company":"","contact":"","phone":"","email":"","address":""},
"invoice_number":"","date":"YYYY-MM-DD","po_number":"","currency":"CAD",
"line_items":[{"code":"","description":"","quantity":0,"unit":"","unit_price":0,"line_total":0}],
"subtotal":0,"gst":0,"pst":0,"shipping":0,"total":0}
Rules: numbers must be plain numbers (no currency symbols or commas). If a field is missing use "" for strings and 0 for numbers. Convert the date to YYYY-MM-DD. Keep the full product description on one line.
INVOICE TEXT:
"""

async def parse_invoice_with_llm(text: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"invoice-{secrets.token_hex(6)}",
        system_message="You extract structured data from supplier invoices and return only JSON.",
    ).with_model("openai", "gpt-4o")
    resp = await chat.send_message(UserMessage(text=INVOICE_SCHEMA_PROMPT + text[:15000]))
    raw = resp.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1] if "```" in raw[3:] else raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().strip("`").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    import json as _json
    return _json.loads(raw)

@api_router.post("/purchases/parse")
async def parse_purchase(file: UploadFile = File(...), user=Depends(require_admin)):
    raw = await file.read()
    try:
        text = extract_pdf_text(raw)
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        raise HTTPException(400, "Could not read PDF")
    if not text.strip():
        raise HTTPException(400, "No text found in PDF (scanned image PDFs are not supported)")
    try:
        data = await parse_invoice_with_llm(text)
    except Exception as e:
        logger.error(f"Invoice LLM parse failed: {e}")
        raise HTTPException(502, "Could not parse the invoice. Please try again.")
    mods, cat = suggest_supplier_defaults((data.get("supplier") or {}).get("company", ""))
    data["suggested_modules"] = mods
    data["suggested_category"] = cat
    for li in data.get("line_items", []):
        li["import"] = True
        li["name"] = (li.get("description") or "")[:60]
    return data

class PurchaseLine(BaseModel):
    code: str = ""
    description: str = ""
    name: str = ""
    quantity: float = 0.0
    unit: str = ""
    unit_price: float = 0.0
    line_total: float = 0.0
    import_material: bool = True

class PurchaseSupplier(BaseModel):
    company: str = ""
    contact: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""

class PurchaseIn(BaseModel):
    supplier: PurchaseSupplier
    invoice_number: str = ""
    date: str = ""
    po_number: str = ""
    currency: str = "CAD"
    subtotal: float = 0.0
    gst: float = 0.0
    pst: float = 0.0
    shipping: float = 0.0
    total: float = 0.0
    default_category: str = "other"
    modules: List[str] = []
    update_inventory: bool = True
    line_items: List[PurchaseLine] = []

@api_router.post("/purchases")
async def create_purchase(body: PurchaseIn, user=Depends(require_admin)):
    sup = body.supplier
    affected = []
    if body.update_inventory:
        for li in body.line_items:
            if not li.import_material:
                continue
            match = None
            if li.code:
                match = await db.materials.find_one({"code": {"$regex": f"^{li.code}$", "$options": "i"}})
            if not match and li.name:
                match = await db.materials.find_one({"name": li.name})
            if match:
                mods = list(set((match.get("modules") or []) + body.modules))
                upd = {
                    "unit_cost": li.unit_price,
                    "stock_qty": (match.get("stock_qty") or 0.0) + li.quantity,
                    "modules": mods,
                    "last_purchase_at": now_iso(),
                }
                for k, v in [("supplier_company", sup.company), ("supplier_contact", sup.contact),
                             ("supplier_phone", sup.phone), ("supplier_email", sup.email)]:
                    if v and not match.get(k):
                        upd[k] = v
                await db.materials.update_one({"_id": match["_id"]}, {"$set": upd})
                affected.append({"id": str(match["_id"]), "name": match.get("name"), "action": "updated"})
            else:
                doc = {
                    "name": li.name or li.description[:60] or li.code,
                    "code": li.code, "category": body.default_category,
                    "supplier_company": sup.company, "supplier_contact": sup.contact,
                    "supplier_phone": sup.phone, "supplier_email": sup.email,
                    "unit": li.unit or "each", "unit_cost": li.unit_price,
                    "stock_qty": li.quantity, "reorder_point": 0.0, "reorder_target": 0.0,
                    "modules": body.modules, "is_default": False,
                    "last_purchase_at": now_iso(), "created_at": now_iso(),
                }
                res = await db.materials.insert_one(doc)
                affected.append({"id": str(res.inserted_id), "name": doc["name"], "action": "created"})
    doc = body.model_dump()
    doc["materials_affected"] = affected
    doc["created_at"] = now_iso()
    doc["created_by"] = user["email"]
    res = await db.purchases.insert_one(doc)
    saved = clean(await db.purchases.find_one({"_id": res.inserted_id}))
    return saved

@api_router.get("/purchases")
async def list_purchases(supplier: Optional[str] = None, date_from: Optional[str] = None,
                         date_to: Optional[str] = None, user=Depends(require_admin)):
    q = {}
    if supplier:
        q["supplier.company"] = {"$regex": supplier, "$options": "i"}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    items = await db.purchases.find(q).sort("date", -1).to_list(2000)
    return [clean(i) for i in items]

@api_router.get("/purchases/summary")
async def purchases_summary(supplier: Optional[str] = None, date_from: Optional[str] = None,
                            date_to: Optional[str] = None, user=Depends(require_admin)):
    """Quarterly GST/PST tax summary + spend grouped by supplier."""
    q = {}
    if supplier:
        q["supplier.company"] = {"$regex": supplier, "$options": "i"}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    items = await db.purchases.find(q).to_list(5000)
    quarters = {}
    suppliers = {}
    for i in items:
        d = i.get("date") or ""
        try:
            yr = int(d[:4]); mo = int(d[5:7]); qtr = (mo - 1) // 3 + 1
            period = f"{yr}-Q{qtr}"
        except Exception:
            yr, qtr, period = 0, 0, "Unknown"
        qg = quarters.setdefault(period, {"period": period, "year": yr, "quarter": qtr,
                                          "subtotal": 0.0, "gst": 0.0, "pst": 0.0,
                                          "shipping": 0.0, "total": 0.0, "count": 0})
        for k in ["subtotal", "gst", "pst", "shipping", "total"]:
            qg[k] = round(qg[k] + (i.get(k) or 0), 2)
        qg["count"] += 1
        comp = (i.get("supplier") or {}).get("company") or "Unknown"
        sg = suppliers.setdefault(comp, {"company": comp, "total": 0.0, "gst": 0.0, "pst": 0.0, "count": 0})
        sg["total"] = round(sg["total"] + (i.get("total") or 0), 2)
        sg["gst"] = round(sg["gst"] + (i.get("gst") or 0), 2)
        sg["pst"] = round(sg["pst"] + (i.get("pst") or 0), 2)
        sg["count"] += 1
    q_list = sorted(quarters.values(), key=lambda x: (x["year"], x["quarter"]), reverse=True)
    s_list = sorted(suppliers.values(), key=lambda x: x["total"], reverse=True)
    return {"quarters": q_list, "by_supplier": s_list}

@api_router.get("/purchases/export.csv")
async def export_purchases_csv(supplier: Optional[str] = None, date_from: Optional[str] = None,
                               date_to: Optional[str] = None, user=Depends(require_admin)):
    import csv, io
    q = {}
    if supplier:
        q["supplier.company"] = {"$regex": supplier, "$options": "i"}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    items = await db.purchases.find(q).sort("date", -1).to_list(5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Supplier", "Invoice #", "PO #", "Currency",
                "Subtotal", "GST", "PST", "Shipping", "Total"])
    for i in items:
        sup = i.get("supplier") or {}
        w.writerow([i.get("date", ""), sup.get("company", ""), i.get("invoice_number", ""),
                    i.get("po_number", ""), i.get("currency", "CAD"),
                    i.get("subtotal", 0), i.get("gst", 0), i.get("pst", 0),
                    i.get("shipping", 0), i.get("total", 0)])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=purchases.csv"})

@api_router.delete("/purchases/{pid}")
async def delete_purchase(pid: str, user=Depends(require_admin)):
    await db.purchases.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}

# ---------------- Profitability: true manufacturing cost + margin ----------------
class ProfitabilityIn(BaseModel):
    base_cost: float = 0.0
    quoted_price: float = 0.0
    production_hours: float = 0.0
    machine_id: Optional[str] = None

@api_router.post("/calc/profitability")
async def calc_profitability(body: ProfitabilityIn, user=Depends(require_admin)):
    s = await get_settings()
    biz = await _business_hourly(s)
    machine_hourly = 0.0
    machine_name = None
    if body.machine_id:
        m = await db.machines.find_one({"_id": ObjectId(body.machine_id)})
        if m:
            oh = s.get("open_hours_per_month", 188) or 188
            machine_hourly = machine_computed(clean(m), oh)["hourly_cost"]
            machine_name = m.get("name")
    shop_rate = round(biz + machine_hourly, 2)
    labor_cost = round(body.production_hours * shop_rate, 2)
    true_cost = round(body.base_cost + labor_cost, 2)
    margin = round(body.quoted_price - true_cost, 2)
    margin_pct = round(margin / body.quoted_price * 100, 1) if body.quoted_price else 0.0
    return {
        "business_hourly": biz,
        "machine_hourly": round(machine_hourly, 2),
        "machine_name": machine_name,
        "shop_rate": shop_rate,
        "production_hours": body.production_hours,
        "labor_cost": labor_cost,
        "base_cost": round(body.base_cost, 2),
        "true_manufacturing_cost": true_cost,
        "quoted_price": round(body.quoted_price, 2),
        "margin": margin,
        "margin_pct": margin_pct,
        "below_cost": margin < 0,
    }

@api_router.get("/finance/profit-dashboard")
async def profit_dashboard(months: int = 6, user=Depends(require_admin)):
    """Monthly P&L: quoted revenue vs actual purchases (pre-tax) vs fixed overhead => net profit."""
    from datetime import datetime, timezone
    s = await get_settings()
    oh_hours = s.get("open_hours_per_month", 188) or 188
    fixed = await db.fixed_costs.find().to_list(500)
    overhead = sum((f.get("amount") or 0) for f in fixed)
    machines = await db.machines.find().to_list(500)
    machines_monthly = sum(machine_computed(clean(m), oh_hours)["monthly_cost"] for m in machines)
    monthly_overhead = round(overhead + machines_monthly, 2)
    mk = s.get("retail_markup_pct", 200) or 0
    margin = mk / (100 + mk) if (100 + mk) else 0
    break_even_revenue = round(monthly_overhead / margin, 2) if margin else 0

    months = max(1, min(months, 24))
    now = datetime.now(timezone.utc)
    keys = []
    y, mo = now.year, now.month
    for _ in range(months):
        keys.append(f"{y:04d}-{mo:02d}")
        mo -= 1
        if mo == 0:
            mo = 12; y -= 1
    keys = list(reversed(keys))
    buckets = {k: {"month": k, "revenue": 0.0, "purchases": 0.0, "quotes": 0, "sales": 0.0} for k in keys}

    async for q in db.quotes.find():
        k = (q.get("created_at") or "")[:7]
        if k in buckets:
            summ = q.get("summary") or {}
            p = (summ.get("retail_total") or summ.get("customer_price")
                 or (summ.get("total") or {}).get("selling_price") or summ.get("selling_price") or 0)
            buckets[k]["revenue"] += p or 0
            buckets[k]["quotes"] += 1

    async for o in db.orders.find({"status": {"$ne": "cancelled"}}):
        k = (o.get("created_at") or "")[:7]
        if k in buckets:
            buckets[k]["sales"] += o.get("total") or 0

    async for pu in db.purchases.find():
        k = (pu.get("date") or "")[:7]
        if k in buckets:
            buckets[k]["purchases"] += (pu.get("subtotal") or 0) + (pu.get("shipping") or 0)

    series = []
    for k in keys:
        b = buckets[k]
        rev = round(b["revenue"], 2)
        pur = round(b["purchases"], 2)
        sales = round(b["sales"], 2)
        tcost = round(pur + monthly_overhead, 2)
        net = round(rev - pur - monthly_overhead, 2)
        series.append({"month": k, "revenue": rev, "purchases": pur, "sales": sales,
                       "overhead": monthly_overhead, "total_cost": tcost,
                       "net_profit": net, "net_real": round(sales - tcost, 2),
                       "quotes": b["quotes"]})
    return {"monthly_overhead": monthly_overhead, "series": series,
            "break_even_revenue": break_even_revenue,
            "gross_margin_pct": round(margin * 100, 1),
            "current": series[-1] if series else None}

@api_router.get("/finance/summary")
async def finance_summary(user=Depends(require_admin)):
    from datetime import datetime, timezone
    s = await get_settings()
    oh_hours = s.get("open_hours_per_month", 188) or 188
    fixed = await db.fixed_costs.find().to_list(500)
    overhead = sum((f.get("amount") or 0) for f in fixed)
    machines = await db.machines.find().to_list(500)
    mc = []
    for m in machines:
        c = clean(m)
        c.update(machine_computed(c, oh_hours))
        mc.append(c)
    machines_monthly = sum(x["monthly_cost"] for x in mc)
    total_monthly = overhead + machines_monthly
    business_hourly = round(overhead / oh_hours, 2) if oh_hours else 0
    mk = s.get("retail_markup_pct", 200) or 0
    margin = mk / (100 + mk) if (100 + mk) else 0
    break_even_rev = round(total_monthly / margin, 2) if margin else 0
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    quoted = 0.0; qcount = 0
    async for q in db.quotes.find({"created_at": {"$regex": f"^{month_prefix}"}}):
        summ = q.get("summary") or {}
        p = (summ.get("retail_total") or summ.get("customer_price")
             or (summ.get("total") or {}).get("selling_price") or summ.get("selling_price") or 0)
        quoted += p or 0; qcount += 1
    total_investment = sum((m.get("purchase_price") or 0) for m in machines)
    lease_oblig = sum((m.get("lease_monthly") or 0) for m in machines if m.get("acquisition") == "leased")
    return {
        "overhead_monthly": round(overhead, 2),
        "machines_monthly": round(machines_monthly, 2),
        "total_monthly_cost": round(total_monthly, 2),
        "business_hourly_rate": business_hourly,
        "open_hours_per_month": oh_hours,
        "gross_margin_pct": round(margin * 100, 1),
        "break_even_revenue_monthly": break_even_rev,
        "quoted_this_month": round(quoted, 2),
        "quotes_this_month": qcount,
        "total_equipment_investment": round(total_investment, 2),
        "monthly_lease_obligations": round(lease_oblig, 2),
        "gst_pct": s.get("gst_pct", 5.0),
        "pst_pct": s.get("pst_pct", 7.0),
        "machine_count": len(machines),
        "fixed_cost_count": len(fixed),
        "machines": sorted(mc, key=lambda x: -x["monthly_cost"]),
        "fixed_costs": sorted([clean(f) for f in fixed], key=lambda x: -(x.get("amount") or 0)),
    }

# ---------------- Ink / toner estimator (with file analysis + self-calibration) ----------------
def analyze_ink_density(raw_bytes):
    import io
    from PIL import Image
    if raw_bytes[:5] == b"%PDF-":
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(raw_bytes)
        page = pdf[0]
        bitmap = page.render(scale=1.5)
        img = bitmap.to_pil().convert("CMYK")
        pdf.close()
    else:
        img = Image.open(io.BytesIO(raw_bytes)).convert("CMYK")
    img.thumbnail((400, 400))
    px = list(img.getdata())
    n = len(px)
    if not n:
        return 0.0
    total = sum(c + m + y + k for (c, m, y, k) in px)
    return total / (n * 4 * 255.0)   # 0..1 average ink density

def compute_ink(machine, area_sqft, coverage_pct):
    frac = (coverage_pct if coverage_pct is not None else 100.0) / 100.0
    ml = area_sqft * frac * (machine.get("ink_ml_per_sqft_full") or 10.0)
    cost = ml * (machine.get("ink_cost_per_ml") or 0.25)
    return round(ml, 2), round(cost, 2)

@api_router.post("/ink/estimate")
async def ink_estimate(
    machine_id: str = Form(...),
    width_in: float = Form(...),
    height_in: float = Form(...),
    quantity: float = Form(1.0),
    coverage_pct: Optional[float] = Form(None),
    file: Optional[UploadFile] = File(None),
    user=Depends(require_admin),
):
    m = await db.machines.find_one({"_id": ObjectId(machine_id)})
    if not m:
        raise HTTPException(404, "Machine not found")
    source = "coverage"
    if file is not None:
        raw = await file.read()
        try:
            density = analyze_ink_density(raw)
        except Exception:
            raise HTTPException(400, "Could not read image (use PNG/JPG/TIFF)")
        ref = m.get("ink_full_ref_density") or 0.55
        frac = min(1.0, density / ref) if ref else density
        source = "file"
    else:
        frac = (coverage_pct if coverage_pct is not None else 100.0) / 100.0
    area = (width_in * height_in / 144.0) * (quantity or 1)
    mlpsf = m.get("ink_ml_per_sqft_full") or 10.0
    cpm = m.get("ink_cost_per_ml") or 0.25
    ml = area * frac * mlpsf
    return {
        "machine": m.get("name"), "source": source,
        "coverage_pct": round(frac * 100, 1), "area_sqft": round(area, 3),
        "ink_ml": round(ml, 2), "ink_cost": round(ml * cpm, 2),
        "ml_per_sqft_full": mlpsf, "cost_per_ml": cpm,
        "samples": m.get("ink_samples") or 0,
    }

INK_BRANDS = ["roland", "mimaki", "epson", "hp", "canon", "mutoh"]

def _brand_of(name: str) -> str:
    n = (name or "").lower()
    for b in INK_BRANDS:
        if b in n:
            return b
    return ""

async def _propagate_ink_calibration(machine: dict, new_val: float) -> int:
    """Apply a calibrated ink rate to all sibling machines of the same brand + category
    (same ink technology, e.g. all Roland eco-solvent or all Roland UV flatbed)."""
    brand = _brand_of(machine.get("name"))
    if not brand:
        return 0
    res = await db.machines.update_many(
        {"_id": {"$ne": machine["_id"]},
         "name": {"$regex": brand, "$options": "i"},
         "category": machine.get("category")},
        {"$set": {"ink_ml_per_sqft_full": round(new_val, 3)}})
    return res.modified_count

class InkCalibration(BaseModel):
    machine_id: str
    area_sqft: float
    coverage_pct: float
    actual_ml: float

@api_router.post("/ink/calibrate")
async def ink_calibrate(body: InkCalibration, user=Depends(require_admin)):
    m = await db.machines.find_one({"_id": ObjectId(body.machine_id)})
    if not m:
        raise HTTPException(404, "Machine not found")
    denom = body.area_sqft * (body.coverage_pct / 100.0)
    if denom <= 0:
        raise HTTPException(400, "Area and coverage must be greater than 0")
    implied = body.actual_ml / denom
    prev = m.get("ink_ml_per_sqft_full") or 0.0
    samples = m.get("ink_samples") or 0
    new_val = (prev * samples + implied) / (samples + 1)
    await db.machines.update_one({"_id": m["_id"]}, {"$set": {
        "ink_ml_per_sqft_full": round(new_val, 3), "ink_samples": samples + 1}})
    siblings = await _propagate_ink_calibration(m, new_val)
    return {"machine": m.get("name"), "implied_ml_per_sqft_full": round(implied, 3),
            "new_ml_per_sqft_full": round(new_val, 3), "samples": samples + 1,
            "siblings_updated": siblings}

@api_router.post("/ink/calibrate-file")
async def ink_calibrate_file(
    machine_id: str = Form(...),
    print_area_sqft: float = Form(...),
    actual_ml: float = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_admin),
):
    """Smart calibration: measures the file's coverage automatically and back-solves the
    machine's ml/ft² @ 100% from a real VersaWorks reading (Print Area + Ink Consumption)."""
    m = await db.machines.find_one({"_id": ObjectId(machine_id)})
    if not m:
        raise HTTPException(404, "Machine not found")
    raw = await file.read()
    try:
        density = analyze_ink_density(raw)
    except Exception:
        raise HTTPException(400, "Could not read file (use PDF/PNG/JPG/TIFF)")
    ref = m.get("ink_full_ref_density") or 0.55
    frac = min(1.0, density / ref) if ref else density
    denom = print_area_sqft * frac
    if denom <= 0:
        raise HTTPException(400, "Print area and measured coverage must be greater than 0")
    implied = actual_ml / denom
    prev = m.get("ink_ml_per_sqft_full") or 0.0
    samples = m.get("ink_samples") or 0
    new_val = (prev * samples + implied) / (samples + 1)
    await db.machines.update_one({"_id": m["_id"]}, {"$set": {
        "ink_ml_per_sqft_full": round(new_val, 3), "ink_samples": samples + 1}})
    siblings = await _propagate_ink_calibration(m, new_val)
    return {"machine": m.get("name"), "coverage_pct": round(frac * 100, 1),
            "implied_ml_per_sqft_full": round(implied, 3),
            "new_ml_per_sqft_full": round(new_val, 3), "samples": samples + 1,
            "siblings_updated": siblings}

# ---------------- Equipment supplies (admin) ----------------
@api_router.get("/equipment/{equipment_id}/supplies")
async def list_supplies(equipment_id: str, user=Depends(get_current_user)):
    items = await db.equipment_supplies.find({"equipment_id": equipment_id}).sort("created_at", -1).to_list(500)
    return [clean(i) for i in items]

@api_router.post("/equipment-supplies")
async def add_supply(body: EquipmentSupply, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["created_at"] = now_iso()
    res = await db.equipment_supplies.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.delete("/equipment-supplies/{supply_id}")
async def delete_supply(supply_id: str, user=Depends(require_admin)):
    await db.equipment_supplies.delete_one({"_id": ObjectId(supply_id)})
    return {"ok": True}

# Presets are per-user convenience (any authenticated user manages their own)
def register_user_crud(path, model, collection):
    coll = db[collection]

    @api_router.get(f"/{path}")
    async def _list(user=Depends(get_current_user)):
        items = await coll.find({"user_id": user["id"]}).sort("created_at", -1).to_list(500)
        return [clean(i) for i in items]

    @api_router.post(f"/{path}")
    async def _create(body: model, user=Depends(get_current_user)):
        doc = body.model_dump()
        doc["user_id"] = user["id"]
        doc["created_at"] = now_iso()
        res = await coll.insert_one(doc)
        doc["_id"] = res.inserted_id
        return clean(doc)

    @api_router.delete(f"/{path}/{{item_id}}")
    async def _delete(item_id: str, user=Depends(get_current_user)):
        await coll.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
        return {"ok": True}

register_user_crud("job-presets", JobPreset, "job_presets")
register_user_crud("laser-presets", LaserPreset, "laser_presets")

# ---------------- User management (admin) ----------------
ROLES = ["admin", "client", "reseller"]

@api_router.get("/users")
async def list_users(user=Depends(require_admin)):
    users = await db.users.find().sort("created_at", -1).to_list(1000)
    return [clean(u) for u in users]

class RoleUpdate(BaseModel):
    role: str

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, body: RoleUpdate, user=Depends(require_admin)):
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if str(user["id"]) == user_id and body.role != "admin":
        raise HTTPException(400, "You cannot remove your own admin role")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": body.role}})
    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    return clean(updated)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_admin)):
    if str(user["id"]) == user_id:
        raise HTTPException(400, "You cannot delete your own account")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"ok": True}

@api_router.get("/config")
async def config(user=Depends(get_current_user)):
    return {
        "sheet_sizes": list(SHEET_SIZES.keys()),
        "big_sheets": {k: list(v) for k, v in BIG_SHEETS.items()},
        "channel_heights": CHANNEL_HEIGHTS,
        "roles": ROLES,
        "product_categories": PRODUCT_CATEGORIES,
        "role": user.get("role"),
    }

# ---------------- Settings routes ----------------
@api_router.get("/settings")
async def read_settings(user=Depends(get_current_user)):
    return await get_settings()

@api_router.put("/settings")
async def write_settings(body: Settings, user=Depends(require_admin)):
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
    stocks = await materials_by_ids("paper_stocks", body.stock_ids, module="paper")
    results = []
    for st in stocks:
        quote = paper_quote(product, st, settings, STANDARD_QTYS, body.laminate, body.sheet_key)
        results.append({"stock": st, "quote": quote})
    results.sort(key=lambda r: r["quote"]["rows"][3]["customer_price_4_4"] if r["quote"]["rows"] else 0)
    return scrub({"product": product, "sheet_key": body.sheet_key, "results": results, "qtys": STANDARD_QTYS}, user["role"])

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
    cover = await material_by_id("paper_stocks", body.cover_stock_id, module="booklet")
    inside = await material_by_id("paper_stocks", body.inside_stock_id, module="booklet")
    if not cover or not inside:
        raise HTTPException(404, "Stock not found")
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
    retail = markup_price(base, settings["retail_markup_pct"])
    wholesale = markup_price(base, settings["wholesale_markup_pct"])
    return scrub({
        "cover": cover, "inside": inside, "cover_sheets": cover_sheets, "inside_sheets": inside_sheets,
        "cover_cost": round(cover_cost, 2), "inside_cost": round(inside_cost, 2),
        "print_cost": round(print_cost, 2), "lamination": round(lam, 2),
        "binding_cost": round(binding_cost, 2), "total_cost": round(base, 2), "base_cost": round(base, 2),
        "quantity": body.quantity,
        "customer_price": retail, "retail_total": retail,
        "wholesale_price": wholesale, "wholesale_total": wholesale,
        "unit_price": round(retail / body.quantity, 2) if body.quantity else 0,
        "wholesale_unit": round(wholesale / body.quantity, 2) if body.quantity else 0,
    }, user["role"])

class LFSize(BaseModel):
    width: float
    height: float
    qty: int = 1

class LFCalcIn(BaseModel):
    sizes: List[LFSize]
    mode: str = "print"
    laminate: bool = False
    material_ids: Optional[List[str]] = None
    machine_id: Optional[str] = None
    ink_coverage_pct: Optional[float] = None

@api_router.post("/calc/largeformat")
async def calc_lf(body: LFCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    mats = await materials_by_ids("roll_materials", body.material_ids, module="large-format")
    machine = None
    if body.machine_id:
        machine = await db.machines.find_one({"_id": ObjectId(body.machine_id)})
    lf_ink_area = sum((s.width * s.height * int(s.qty)) for s in body.sizes) / 144.0
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
        total["base_cost"] = round(total["material_cost"] + total["printing_cost"] + total["extra_cost"], 2)
        _tq = sum(int(s.qty) for s in body.sizes) or 1
        total["quantity"] = _tq
        if machine:
            ink_ml, ink_cost = compute_ink(clean(machine), lf_ink_area, body.ink_coverage_pct)
            total["ink_ml"] = ink_ml
            total["ink_cost"] = ink_cost
            total["machine_name"] = machine.get("name")
            new_base = round(total["base_cost"] + ink_cost, 2)
            total["base_cost"] = new_base
            total["selling_price"] = markup_price(new_base, settings["retail_markup_pct"])
            total["wholesale_price"] = markup_price(new_base, settings["wholesale_markup_pct"])
        total["unit_price"] = round(total["selling_price"] / _tq, 2)
        total["wholesale_unit"] = round(total["wholesale_price"] / _tq, 2)
        placed, used_len, area = nest_pieces(
            [{"w": s.width, "h": s.height, "qty": s.qty, "label": f'{s.width}x{s.height}'} for s in body.sizes],
            m["printable_width"])
        layout = {"bin_width": m["printable_width"], "used_length": used_len, "placements": placed}
        results.append({"material": m, "sizes": size_rows, "total": total, "layout": layout})
    results.sort(key=lambda r: r["total"]["selling_price"])
    return scrub({"results": results, "mode": body.mode}, user["role"])

class StickerCalcIn(BaseModel):
    width: float = 3.0
    height: float = 3.0
    qty: int = 100
    finishing: str = "kisscut"  # kisscut | diecut | individual
    laminate: bool = False

@api_router.post("/calc/sticker")
async def calc_sticker(body: StickerCalcIn, user=Depends(get_current_user)):
    settings = await get_settings()
    mats = await materials_for_collection("roll_materials", {"sticker_compatible": True}, module="stickers")
    results = []
    for m in mats:
        printable = m["printable_width"]
        placed, used_len, area = nest_pieces([{"w": body.width, "h": body.height, "qty": body.qty, "label": "sticker"}], printable)
        min_area = (printable * m["min_linear_feet"] * 12.0) / 144.0
        billed_area = max(area, min_area)
        material_cost = billed_area * m["price_per_sqft"]
        printing_cost = billed_area * settings["lf_print_per_sqft"]
        finishing_cost = 0.0
        if body.finishing == "kisscut":
            finishing_cost = billed_area * settings["sticker_kisscut_per_sqft"]
        elif body.finishing == "diecut":
            finishing_cost = billed_area * settings["sticker_diecut_per_sqft"]
        elif body.finishing == "individual":
            finishing_cost = body.qty * settings["sticker_individual_cut_per_piece"]
        lam_cost = billed_area * settings["sticker_laminate_per_sqft"] if body.laminate else 0.0
        base = material_cost + printing_cost + finishing_cost + lam_cost
        results.append(scrub({
            "material": m.get("name"), "material_id": m.get("id"), "is_default": m.get("is_default"),
            "width": body.width, "height": body.height, "qty": body.qty,
            "finishing": body.finishing, "laminate": body.laminate,
            "billed_sqft": round(billed_area, 3),
            "material_cost": round(material_cost, 2), "printing_cost": round(printing_cost, 2),
            "extra_cost": round(finishing_cost + lam_cost, 2), "base_cost": round(base, 2),
            "selling_price": markup_price(base, settings["retail_markup_pct"]),
            "wholesale_price": markup_price(base, settings["wholesale_markup_pct"]),
            "unit_price": round(markup_price(base, settings["retail_markup_pct"]) / body.qty, 3) if body.qty else 0,
            "wholesale_unit": round(markup_price(base, settings["wholesale_markup_pct"]) / body.qty, 3) if body.qty else 0,
            "layout": {"bin_width": printable, "used_length": used_len, "placements": placed},
        }, user["role"]))
    results.sort(key=lambda r: r.get("selling_price", r.get("wholesale_price", 0)))
    return {"results": results}

@api_router.get("/calc/equipment/{eq_id}")
async def calc_equipment(eq_id: str, user=Depends(require_admin)):
    eq = await db.equipment.find_one({"_id": ObjectId(eq_id)})
    if not eq:
        raise HTTPException(404, "Not found")
    eq = clean(eq)
    return {"equipment": eq, "cost": equipment_cost(eq)}

# ---------------- New module calc engines ----------------
class Placement(BaseModel):
    label: str = ""
    w: float = 0
    h: float = 0

class DTFCalcIn(BaseModel):
    garment_id: Optional[str] = None
    placements: List[Placement] = []
    quantity: int = 12

@api_router.post("/calc/dtf")
async def calc_dtf(body: DTFCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    garment = None
    g_cost = 0.0
    if body.garment_id:
        g = await db.garments.find_one({"_id": ObjectId(body.garment_id)})
        if g:
            garment = clean(g)
            g_cost = garment["cost_each"]
    roll_w = s["dtf_roll_width"]
    items = [{"w": p.w, "h": p.h, "qty": 1, "label": p.label} for p in body.placements if p.w > 0 and p.h > 0]
    placed, used_len, area_per_garment = nest_pieces(items, roll_w)
    dtf_cost = area_per_garment * s["dtf_per_sqft"]
    labor = s["dtf_labor_per_shirt"]
    unit_base = g_cost + dtf_cost + labor
    base = unit_base * body.quantity
    return scrub({
        "garment": garment, "roll_width": roll_w, "section_length": used_len,
        "area_per_garment_sqft": area_per_garment, "quantity": body.quantity,
        "garment_cost": round(g_cost, 2), "dtf_cost": round(dtf_cost, 2), "labor": round(labor, 2),
        "base_cost": round(base, 2),
        "retail_total": markup_price(base, s["retail_markup_pct"]),
        "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
        "unit_price": round(markup_price(base, s["retail_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
        "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
        "layout": {"bin_width": roll_w, "used_length": used_len, "placements": placed},
    }, user["role"])

class EmbPlacement(BaseModel):
    label: str = ""
    stitch_count: int = 0

class EmbroideryCalcIn(BaseModel):
    garment_id: Optional[str] = None
    placements: List[EmbPlacement] = []
    quantity: int = 12
    digitizing: bool = False

@api_router.post("/calc/embroidery")
async def calc_embroidery(body: EmbroideryCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    garment = None
    g_cost = 0.0
    if body.garment_id:
        g = await db.garments.find_one({"_id": ObjectId(body.garment_id)})
        if g:
            garment = clean(g)
            g_cost = garment["cost_each"]
    total_stitches = sum(max(p.stitch_count, 0) for p in body.placements)
    emb = (total_stitches / 1000.0) * s["embroidery_per_1000_stitches"]
    setup = s["embroidery_digitizing_1_3"] if body.digitizing else 0.0
    unit_base = g_cost + emb
    base = unit_base * body.quantity + setup
    return scrub({
        "garment": garment, "total_stitches": total_stitches, "logos": len(body.placements),
        "quantity": body.quantity, "digitizing": body.digitizing,
        "garment_cost": round(g_cost, 2), "embroidery_cost": round(emb, 2), "setup": round(setup, 2),
        "base_cost": round(base, 2),
        "retail_total": markup_price(base, s["retail_markup_pct"]),
        "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
        "unit_price": round(markup_price(base, s["retail_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
        "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
    }, user["role"])

class JobSize(BaseModel):
    label: str = ""
    w: float = 0
    h: float = 0
    qty: int = 1

class LaserCalcIn(BaseModel):
    material_id: Optional[str] = None
    sizes: List[JobSize] = []
    cut_length_in: float = 24.0
    engrave_area_sqin: float = 4.0

@api_router.post("/calc/laser")
async def calc_laser(body: LaserCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    mats = await materials_by_ids("laser_materials", [body.material_id] if body.material_id else None, module="laser")
    total_qty = sum(int(z.qty) for z in body.sizes) or 1
    items = [{"w": z.w, "h": z.h, "qty": z.qty, "label": z.label or f"{z.w}x{z.h}"} for z in body.sizes if z.w > 0 and z.h > 0]
    results = []
    for m in mats:
        placed, used_len, _ = nest_pieces(items, m["sheet_width"])
        sheets = max(math.ceil(used_len / m["sheet_height"]), 1) if used_len else 1
        sheet_cost = sheets * m["cost_per_sheet"]
        cut_cost = (body.cut_length_in / 12.0) * s["laser_cut_per_linear_ft"]
        engrave_cost = body.engrave_area_sqin * s["laser_engraving_per_sqin"]
        setup = s["laser_setup"]
        base = sheet_cost + cut_cost + engrave_cost + setup
        results.append(scrub({
            "material": m, "sheets": sheets, "quantity": total_qty,
            "sheet_cost": round(sheet_cost, 2), "cut_cost": round(cut_cost, 2),
            "engrave_cost": round(engrave_cost, 2), "setup": round(setup, 2), "base_cost": round(base, 2),
            "retail_total": markup_price(base, s["retail_markup_pct"]),
            "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
            "unit_price": round(markup_price(base, s["retail_markup_pct"]) / total_qty, 2) if total_qty else 0,
            "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / total_qty, 2) if total_qty else 0,
            "layout": {"bin_width": m["sheet_width"], "sheet_height": m["sheet_height"], "used_length": used_len, "placements": placed},
        }, user["role"]))
    return {"results": results}

class DirectPrintCalcIn(BaseModel):
    material_ids: Optional[List[str]] = None
    sheet_size: str = "4x8"
    sizes: List[JobSize] = []
    cnc: bool = False
    cnc_cut_length_in: float = 0.0
    machine_id: Optional[str] = None
    ink_coverage_pct: Optional[float] = None

@api_router.post("/calc/directprint")
async def calc_directprint(body: DirectPrintCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    sw, sh = BIG_SHEETS.get(body.sheet_size, (48, 96))
    mats = await materials_by_ids("sheet_materials", body.material_ids, module="direct-print")
    items = [{"w": z.w, "h": z.h, "qty": z.qty, "label": z.label or f"{z.w}x{z.h}"} for z in body.sizes if z.w > 0 and z.h > 0]
    total_qty = sum(int(z.qty) for z in body.sizes) or 1
    print_area = sum((z.w * z.h) / 144.0 * int(z.qty) for z in body.sizes)
    machine = None
    if body.machine_id:
        machine = await db.machines.find_one({"_id": ObjectId(body.machine_id)})
    results = []
    sheet_area_sqft = (sw * sh) / 144.0
    for m in mats:
        placed, used_len, _ = nest_pieces(items, sw)
        sheets = max(math.ceil(used_len / sh), 1) if used_len else 1
        sheet_cost = sheets * sheet_area_sqft * m["price_per_sqft"]
        print_cost = print_area * s["directprint_per_sqft"]
        cnc_cost = 0.0
        if body.cnc and m.get("cnc_capable"):
            cnc_cost = (body.cnc_cut_length_in / 12.0) * s["cnc_cut_per_linear_ft"]
        ink_ml, ink_cost = (0.0, 0.0)
        if machine:
            ink_ml, ink_cost = compute_ink(clean(machine), print_area, body.ink_coverage_pct)
        base = sheet_cost + print_cost + cnc_cost + ink_cost
        results.append(scrub({
            "material": m, "sheet_size": body.sheet_size, "sheets": sheets, "quantity": total_qty,
            "print_sqft": round(print_area, 2),
            "sheet_cost": round(sheet_cost, 2), "print_cost": round(print_cost, 2),
            "cnc_cost": round(cnc_cost, 2), "ink_cost": round(ink_cost, 2), "ink_ml": round(ink_ml, 2),
            "machine_name": machine.get("name") if machine else None, "base_cost": round(base, 2),
            "retail_total": markup_price(base, s["retail_markup_pct"]),
            "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
            "unit_price": round(markup_price(base, s["retail_markup_pct"]) / total_qty, 2) if total_qty else 0,
            "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / total_qty, 2) if total_qty else 0,
            "layout": {"bin_width": sw, "sheet_height": sh, "used_length": used_len, "placements": placed},
        }, user["role"]))
    results.sort(key=lambda r: r.get("retail_total", r.get("wholesale_total", 0)))
    return {"results": results, "sheet_size": body.sheet_size}

class Letter(BaseModel):
    width: float = 12.0
    height: float = 12.0
    qty: int = 1
    label: str = ""

class ChannelCalcIn(BaseModel):
    material_ids: Optional[List[str]] = None
    sheet_size: str = "4x8"
    letters: List[Letter] = []

@api_router.post("/calc/channelletters")
async def calc_channel(body: ChannelCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    sw, sh = BIG_SHEETS.get(body.sheet_size, (48, 96))
    _sheet_all = await materials_by_ids("sheet_materials", body.material_ids, module="channel-letters")
    mats = [m for m in _sheet_all if m.get("channel_capable")]
    margin = s["channel_fixture_margin_in"]
    ret_depth = s["channel_return_depth_in"]
    # rectangle with fixture margin on every side
    items = [{"w": l.width + 2 * margin, "h": l.height + 2 * margin, "qty": l.qty,
              "label": l.label or f'{l.width}x{l.height}'} for l in body.letters if l.width > 0 and l.height > 0]
    total_letters = sum(int(l.qty) for l in body.letters) or 0
    perimeter_total = sum(2 * (l.width + l.height) * int(l.qty) for l in body.letters)
    results = []
    sheet_area_sqft = (sw * sh) / 144.0
    for m in mats:
        placed, used_len, _ = nest_pieces(items, sw)
        face_sheets = max(math.ceil(used_len / sh), 1) if used_len else 0
        return_linear_per_sheet = (sw // ret_depth) * sh if ret_depth else 0
        return_sheets = math.ceil(perimeter_total / return_linear_per_sheet) if return_linear_per_sheet else 0
        face_cost = face_sheets * sheet_area_sqft * m["price_per_sqft"]
        return_cost = return_sheets * sheet_area_sqft * m["price_per_sqft"]
        labor = s["channel_letter_labor"] * total_letters
        base = face_cost + return_cost + labor
        results.append(scrub({
            "material": m, "quantity": total_letters, "fixture_margin": margin,
            "face_sheets": face_sheets, "return_sheets": return_sheets,
            "face_cost": round(face_cost, 2), "return_cost": round(return_cost, 2), "labor": round(labor, 2),
            "base_cost": round(base, 2),
            "retail_total": markup_price(base, s["retail_markup_pct"]),
            "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
            "unit_price": round(markup_price(base, s["retail_markup_pct"]) / total_letters, 2) if total_letters else 0,
            "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / total_letters, 2) if total_letters else 0,
            "layout": {"bin_width": sw, "sheet_height": sh, "used_length": used_len, "placements": placed},
        }, user["role"]))
    results.sort(key=lambda r: r.get("retail_total", r.get("wholesale_total", 0)))
    return {"results": results, "sheet_size": body.sheet_size, "heights": CHANNEL_HEIGHTS}


class SublimationCalcIn(BaseModel):
    product_id: str
    quantity: int = 25

@api_router.post("/calc/sublimation")
async def calc_sublimation(body: SublimationCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    p = await db.sublimation_products.find_one({"_id": ObjectId(body.product_id)})
    if not p:
        raise HTTPException(404, "Product not found")
    p = clean(p)
    blank = p.get("cost_per_unit") or (p["price_per_box"] / p["pieces_per_box"] if p.get("pieces_per_box") else 0)
    blank_cost = blank * body.quantity
    paper_cost = 0.0
    ink_cost = 0.0
    used_len = 0.0
    if p.get("uses_paper") and p.get("print_bleed_w") and p.get("print_bleed_h"):
        placed, used_len, area = nest_pieces(
            [{"w": p["print_bleed_w"], "h": p["print_bleed_h"], "qty": body.quantity, "label": p["name"]}],
            s["sublimation_paper_width"])
        roll_area = (s["sublimation_paper_width"] * s["sublimation_paper_length_ft"] * 12.0) / 144.0
        cost_per_sqft = s["sublimation_paper_roll_cost"] / roll_area if roll_area else 0
        paper_cost = area * cost_per_sqft
        ink_cost = area * s["sublimation_ink_per_sqft"]
    labor = s["sublimation_labor_per_unit"] * body.quantity
    base = blank_cost + paper_cost + ink_cost + labor
    return scrub({
        "product": p, "quantity": body.quantity, "paper_used_in": round(used_len, 1),
        "blank_cost": round(blank_cost, 2), "material_cost": round(paper_cost, 2),
        "ink_cost": round(ink_cost, 2), "labor": round(labor, 2), "base_cost": round(base, 2),
        "retail_total": markup_price(base, s["retail_markup_pct"]),
        "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
        "unit_price": round(markup_price(base, s["retail_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
        "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / body.quantity, 2) if body.quantity else 0,
    }, user["role"])


class RollStickerCalcIn(BaseModel):
    material_id: str
    quantity: int = 500

@api_router.post("/calc/rollsticker")
async def calc_rollsticker(body: RollStickerCalcIn, user=Depends(get_current_user)):
    s = await get_settings()
    m = await material_by_id("roll_sticker_materials", body.material_id, module="roll-stickers")
    if not m:
        raise HTTPException(404, "Material not found")
    waste = s["rollsticker_waste_pieces"]
    total_pieces = body.quantity + waste
    rolls = math.ceil(total_pieces / m["pieces_per_roll"]) if m.get("pieces_per_roll") else 1
    material_cost = rolls * m["roll_cost"]
    ink_cost = body.quantity * s["rollsticker_ink_per_sticker"] + s["rollsticker_cleaning_cost"]
    labor = s["rollsticker_labor"]
    base = material_cost + ink_cost + labor
    prod_min = body.quantity / s["rollsticker_stickers_per_min"] if s["rollsticker_stickers_per_min"] else 0
    return scrub({
        "material": m, "quantity": body.quantity, "waste_pieces": waste, "rolls_needed": rolls,
        "production_minutes": round(prod_min, 1),
        "material_cost": round(material_cost, 2), "ink_cost": round(ink_cost, 2), "labor": round(labor, 2),
        "base_cost": round(base, 2),
        "retail_total": markup_price(base, s["retail_markup_pct"]),
        "wholesale_total": markup_price(base, s["wholesale_markup_pct"]),
        "unit_price": round(markup_price(base, s["retail_markup_pct"]) / body.quantity, 3) if body.quantity else 0,
        "wholesale_unit": round(markup_price(base, s["wholesale_markup_pct"]) / body.quantity, 3) if body.quantity else 0,
    }, user["role"])


# ---------------- Saved quotes ----------------
class QuoteIn(BaseModel):
    module: str
    title: str
    summary: dict
    inputs: dict = {}
    customer_name: str = ""
    customer_email: str = ""
    notes: str = ""
    quote_type: str = "single"
    items: List[dict] = []

@api_router.post("/quotes")
async def save_quote(body: QuoteIn, user=Depends(get_current_user)):
    doc = {"module": body.module, "title": body.title, "summary": body.summary, "inputs": body.inputs,
           "customer_name": body.customer_name, "customer_email": body.customer_email, "notes": body.notes,
           "quote_type": body.quote_type, "items": body.items,
           "user_id": user["id"], "user_email": user["email"], "created_at": now_iso()}
    res = await db.quotes.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.get("/quotes")
async def list_quotes(user=Depends(get_current_user)):
    q = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    items = await db.quotes.find(q).sort("created_at", -1).to_list(500)
    return [clean(i) for i in items]

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user=Depends(get_current_user)):
    q = {"_id": ObjectId(quote_id)}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    await db.quotes.delete_one(q)
    return {"ok": True}

# ---------------- Product catalog (quote -> product) ----------------
PRODUCT_CATEGORIES = ["Business Cards", "Flyers", "Brochures", "Booklets", "Postcards",
                      "Banners", "Signs", "Stickers", "Labels", "Decals", "Apparel",
                      "Posters", "Packaging", "Other"]

class CatalogProduct(BaseModel):
    name: str
    category: str = "Other"
    module: str = ""
    price: float = 0.0                 # retail price (manual fallback when no BoM)
    wholesale_price: float = 0.0
    retail_markup_pct: Optional[float] = None    # for dynamic BoM pricing (else settings)
    wholesale_markup_pct: Optional[float] = None
    description: str = ""
    image_url: str = ""
    published: bool = False
    source_quote_id: Optional[str] = None
    specs: dict = {}
    # BoM: [{material_id, material_name, qty_per_unit, waste_per_order, waste_per_unit}]
    bom: List[dict] = []

async def compute_product_pricing(product, settings, mats_by_id=None):
    """If a product has a BoM, compute unit material cost + dynamic retail/wholesale price
    from live central material costs. Returns None if no BoM (keep manual price)."""
    bom = product.get("bom") or []
    if not bom:
        return None
    if mats_by_id is None:
        ids = [ObjectId(b["material_id"]) for b in bom if b.get("material_id")]
        mats_by_id = {str(m["_id"]): m for m in await db.materials.find({"_id": {"$in": ids}}).to_list(500)}
    unit_cost = 0.0
    for b in bom:
        mat = mats_by_id.get(b.get("material_id"))
        if not mat:
            continue
        unit_cost += (mat.get("unit_cost") or 0.0) * (b.get("qty_per_unit") or 0.0)
    unit_cost = round(unit_cost, 4)
    rm = product.get("retail_markup_pct")
    rm = settings.get("retail_markup_pct", 200) if rm in (None, "") else rm
    wm = product.get("wholesale_markup_pct")
    wm = settings.get("wholesale_markup_pct", 100) if wm in (None, "") else wm
    return {"computed_cost": unit_cost,
            "price": round(unit_cost * (1 + rm / 100.0), 2),
            "wholesale_price": round(unit_cost * (1 + wm / 100.0), 2)}

@api_router.get("/catalog-products")
async def list_catalog_products(user=Depends(get_current_user)):
    role = user.get("role")
    q = {} if role == "admin" else {"published": True}
    items = [clean(i) for i in await db.catalog_products.find(q).sort("name", 1).to_list(2000)]
    s = await get_settings()
    for p in items:
        pricing = await compute_product_pricing(p, s)
        if pricing:
            p["price"] = pricing["price"]
            p["wholesale_price"] = pricing["wholesale_price"]
            p["dynamic_pricing"] = True
            if role == "admin":
                p["computed_cost"] = pricing["computed_cost"]
        retail = p.get("price") or 0
        wholesale = p.get("wholesale_price") or retail
        p["your_price"] = wholesale if role == "reseller" else retail
        if role not in ("admin",):
            if role == "client":
                p.pop("wholesale_price", None)
            p.pop("bom", None)
            p.pop("computed_cost", None)
    return items

@api_router.post("/catalog-products")
async def create_catalog_product(body: CatalogProduct, user=Depends(require_admin)):
    doc = body.model_dump()
    doc["created_at"] = now_iso()
    res = await db.catalog_products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.put("/catalog-products/{pid}")
async def update_catalog_product(pid: str, body: CatalogProduct, user=Depends(require_admin)):
    await db.catalog_products.update_one({"_id": ObjectId(pid)}, {"$set": body.model_dump()})
    return clean(await db.catalog_products.find_one({"_id": ObjectId(pid)}))

@api_router.delete("/catalog-products/{pid}")
async def delete_catalog_product(pid: str, user=Depends(require_admin)):
    await db.catalog_products.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}

@api_router.get("/products/waste-suggestion")
async def waste_suggestion(material_id: str, category: str = "", module: str = "", user=Depends(require_admin)):
    """Suggest waste (per-order + per-unit) for a material based on the average across existing
    products in the same category/module that already use that material."""
    q = {"bom.material_id": material_id}
    ors = []
    if category:
        ors.append({"category": category})
    if module:
        ors.append({"module": module})
    if ors:
        q["$or"] = ors
    prods = await db.catalog_products.find(q).to_list(500)
    wpo, wpu, n = [], [], 0
    for p in prods:
        for b in (p.get("bom") or []):
            if b.get("material_id") == material_id:
                wpo.append(b.get("waste_per_order") or 0.0)
                wpu.append(b.get("waste_per_unit") or 0.0)
                n += 1
    if not n:
        return {"waste_per_order": 0, "waste_per_unit": 0, "samples": 0}
    return {"waste_per_order": round(sum(wpo) / n, 3),
            "waste_per_unit": round(sum(wpu) / n, 4), "samples": n}


class ToProductIn(BaseModel):
    name: str
    category: str = "Other"
    price: float = 0.0
    wholesale_price: float = 0.0
    description: str = ""
    published: bool = False

@api_router.post("/quotes/{quote_id}/to-product")
async def quote_to_product(quote_id: str, body: ToProductIn, user=Depends(require_admin)):
    q = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    if not q:
        raise HTTPException(404, "Quote not found")
    doc = body.model_dump()
    doc.update({"module": q.get("module", ""), "source_quote_id": quote_id, "bom": [],
                "specs": {"summary": q.get("summary", {}), "inputs": q.get("inputs", {})},
                "created_at": now_iso()})
    res = await db.catalog_products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

# ---------------- Orders (storefront) + inventory deduction ----------------
async def deduct_inventory_for_order(enriched):
    """enriched: [{product(dict), qty}]. Deduct BoM usage (qty_per_unit * qty) per material,
    PLUS per-product waste: waste_per_order (once per product line) + waste_per_unit * qty."""
    used = {}
    waste_acc = {}
    for it in enriched:
        for b in (it["product"].get("bom") or []):
            mid = b.get("material_id")
            if not mid:
                continue
            used[mid] = used.get(mid, 0.0) + (b.get("qty_per_unit") or 0.0) * it["qty"]
            w = (b.get("waste_per_order") or 0.0) + (b.get("waste_per_unit") or 0.0) * it["qty"]
            waste_acc[mid] = waste_acc.get(mid, 0.0) + w
    deductions = []
    for mid, usage in used.items():
        try:
            mat = await db.materials.find_one({"_id": ObjectId(mid)})
        except Exception:
            mat = None
        if not mat:
            continue
        waste = round(waste_acc.get(mid, 0.0), 3)
        total = round(usage + waste, 3)
        new_stock = round((mat.get("stock_qty") or 0.0) - total, 3)
        await db.materials.update_one({"_id": ObjectId(mid)}, {"$set": {"stock_qty": new_stock}})
        deductions.append({"material_id": mid, "material_name": mat.get("name"),
                           "unit": mat.get("unit"), "used": round(usage, 3), "waste": waste,
                           "total": total, "new_stock": new_stock, "short": new_stock < 0})
    return deductions

class OrderItemIn(BaseModel):
    product_id: str
    qty: float = 1.0

class OrderIn(BaseModel):
    items: List[OrderItemIn]
    notes: str = ""
    customer_name: str = ""

@api_router.post("/orders")
async def create_order(body: OrderIn, user=Depends(get_current_user)):
    role = user.get("role")
    s = await get_settings()
    line_items, enriched, total = [], [], 0.0
    for it in body.items:
        try:
            prod = await db.catalog_products.find_one({"_id": ObjectId(it.product_id)})
        except Exception:
            prod = None
        if not prod or not prod.get("published"):
            continue
        p = clean(prod)
        pricing = await compute_product_pricing(p, s)
        retail = pricing["price"] if pricing else (p.get("price") or 0.0)
        wholesale = (pricing["wholesale_price"] if pricing else p.get("wholesale_price")) or retail
        price = wholesale if role == "reseller" else retail
        lt = round(price * it.qty, 2)
        total += lt
        line_items.append({"product_id": it.product_id, "name": p.get("name"),
                           "category": p.get("category"), "qty": it.qty,
                           "unit_price": price, "line_total": lt})
        enriched.append({"product": p, "qty": it.qty})
    if not line_items:
        raise HTTPException(400, "No valid published products in order")
    deductions = await deduct_inventory_for_order(enriched)
    doc = {"user_id": user["id"], "user_email": user["email"], "role": role,
           "customer_name": body.customer_name or user["email"],
           "items": line_items, "total": round(total, 2), "notes": body.notes,
           "status": "pending", "inventory_deductions": deductions, "created_at": now_iso()}
    res = await db.orders.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api_router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    q = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    items = await db.orders.find(q).sort("created_at", -1).to_list(2000)
    out = []
    for o in items:
        c = clean(o)
        if user.get("role") != "admin":
            c.pop("inventory_deductions", None)
        out.append(c)
    return out

class OrderStatusIn(BaseModel):
    status: str

@api_router.put("/orders/{oid}/status")
async def update_order_status(oid: str, body: OrderStatusIn, user=Depends(require_admin)):
    await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": body.status}})
    return clean(await db.orders.find_one({"_id": ObjectId(oid)}))

@api_router.delete("/orders/{oid}")
async def delete_order(oid: str, user=Depends(require_admin)):
    await db.orders.delete_one({"_id": ObjectId(oid)})
    return {"ok": True}

# ---------------- Stripe payment (pay an existing order) ----------------
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

class CheckoutIn(BaseModel):
    order_id: str
    origin_url: str

@api_router.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, user=Depends(get_current_user)):
    order = await db.orders.find_one({"_id": ObjectId(body.order_id)})
    if not order:
        raise HTTPException(404, "Order not found")
    if user.get("role") != "admin" and order.get("user_id") != user["id"]:
        raise HTTPException(403, "Not your order")
    amount = float(order.get("total") or 0)
    if amount <= 0:
        raise HTTPException(400, "Order total must be greater than 0")
    session = stripe.checkout.Session.create(
        line_items=[{"price_data": {"currency": "cad", "unit_amount": int(round(amount * 100)),
                     "product_data": {"name": f"Order · {order.get('customer_name', '')}".strip(" ·")}},
                     "quantity": 1}],
        mode="payment",
        success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment/cancel",
        metadata={"order_id": body.order_id, "user_id": user["id"]},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "order_id": body.order_id, "user_id": user["id"],
        "amount": amount, "currency": "cad", "status": "initiated",
        "payment_status": "pending", "created_at": now_iso(), "updated_at": now_iso()})
    return {"checkout_url": session.url, "session_id": session.id}

async def _send_order_paid_email(order: dict):
    to_email = order.get("user_email")
    if not to_email:
        return
    rows = "".join(
        f"<tr><td style='padding:6px 0;border-bottom:1px solid #eee'>{i.get('name','')}</td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #eee;text-align:right'>{i.get('qty')}</td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #eee;text-align:right'>{_fmt(i.get('line_total'))}</td></tr>"
        for i in (order.get("items") or [])
    )
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a'>
      <h2 style='color:#2495D3;margin-bottom:4px'>Payment received — thank you!</h2>
      <p style='color:#64748b;font-size:14px'>Hi {order.get('customer_name','')}, we've received your payment. Your order is confirmed.</p>
      <table style='width:100%;border-collapse:collapse;font-size:14px;margin-top:12px'>
        <thead><tr style='text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase'>
          <th style='padding-bottom:6px'>Product</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Total</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <p style='text-align:right;font-weight:bold;font-size:16px;margin-top:12px'>Total paid: {_fmt(order.get('total'))}</p>
      <p style='color:#94a3b8;font-size:12px;margin-top:24px'>Print and Save — Your Brand in Focus</p>
    </div>"""
    payload = {
        "to": [to_email],
        "subject": "Your Print and Save order is paid ✓",
        "html": html,
        "from_name": os.environ["EMAIL_FROM_NAME"],
        "contact_email": to_email,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Order paid email error: {e}")

async def _send_admin_order_paid_email(order: dict):
    admins = await db.users.find({"role": "admin"}).to_list(50)
    to = [a.get("email") for a in admins if a.get("email")]
    if not to:
        return
    rows = "".join(
        f"<tr><td style='padding:6px 0;border-bottom:1px solid #eee'>{i.get('name','')}</td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #eee;text-align:right'>{i.get('qty')}</td>"
        f"<td style='padding:6px 0;border-bottom:1px solid #eee;text-align:right'>{_fmt(i.get('line_total'))}</td></tr>"
        for i in (order.get("items") or [])
    )
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a'>
      <h2 style='color:#16a34a;margin-bottom:4px'>New paid order 💰</h2>
      <p style='color:#64748b;font-size:14px'>{order.get('customer_name','')} ({order.get('user_email','')}) just paid an order. Time to produce.</p>
      <table style='width:100%;border-collapse:collapse;font-size:14px;margin-top:12px'>
        <thead><tr style='text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase'>
          <th style='padding-bottom:6px'>Product</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Total</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <p style='text-align:right;font-weight:bold;font-size:16px;margin-top:12px'>Total: {_fmt(order.get('total'))}</p>
      {f"<p style='color:#64748b;font-size:13px'>Notes: {order.get('notes')}</p>" if order.get('notes') else ""}
    </div>"""
    payload = {
        "to": to,
        "subject": f"New paid order — {order.get('customer_name','')} · {_fmt(order.get('total'))}",
        "html": html,
        "from_name": os.environ["EMAIL_FROM_NAME"],
        "contact_email": order.get("user_email") or to[0],
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Admin order paid email error: {e}")

async def _mark_paid(session_id, order_id=None):
    await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}})
    if not order_id:
        tx = await db.payment_transactions.find_one({"session_id": session_id})
        order_id = tx.get("order_id") if tx else None
    if order_id:
        order = await db.orders.find_one({"_id": ObjectId(order_id)})
        if order and order.get("status") != "paid":
            await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {"status": "paid"}})
            await _send_order_paid_email(order)
            await _send_admin_order_paid_email(order)

@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    rec = await db.payment_transactions.find_one({"session_id": session_id})
    if not rec:
        raise HTTPException(404, "Transaction not found")
    if rec.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(session_id, rec.get("order_id"))
                rec = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": rec["session_id"], "status": rec["status"], "payment_status": rec["payment_status"]}

@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await _mark_paid(obj["id"], (obj.get("metadata") or {}).get("order_id"))
    return {"status": "ok"}

def _fmt(v):
    try:
        return f"${float(v):,.2f} CAD"
    except Exception:
        return str(v)

def build_quote_html(quote: dict, role: str) -> str:
    s = quote.get("summary", {}) or {}
    def pick(*keys):
        for k in keys:
            if s.get(k) is not None:
                return s[k]
        for coll in (s.get("results") or []):
            for k in keys:
                if coll.get(k) is not None:
                    return coll[k]
        t = s.get("total") or {}
        for k in keys:
            if t.get(k) is not None:
                return t[k]
        return None
    retail = pick("retail_total", "customer_price", "selling_price")
    wholesale = pick("wholesale_total", "wholesale_price")
    rows = ""
    items = quote.get("items") or []
    if items:
        rows += '<tr><td colspan="2" style="padding:6px 0;"><table width="100%" cellpadding="0" cellspacing="0">'
        for it in items:
            rows += (f'<tr><td style="padding:6px 0;color:#334155;">{it.get("module","")} · {it.get("title","")}'
                     f' × {it.get("qty",1)}</td><td style="padding:6px 0;text-align:right;color:#0a0a0a;">'
                     f'{_fmt((it.get("price") or 0) * (it.get("qty") or 1))}</td></tr>')
        rows += '</table></td></tr>'
        combined = sum((it.get("price") or 0) * (it.get("qty") or 1) for it in items)
        rows += (f'<tr><td style="padding:10px 0;color:#0a0a0a;font-weight:700;border-top:2px solid #2495D3;">Total</td>'
                 f'<td style="padding:10px 0;text-align:right;font-weight:800;color:#2495D3;border-top:2px solid #2495D3;">{_fmt(combined)}</td></tr>')
    else:
        if retail is not None:
            rows += f'<tr><td style="padding:8px 0;color:#334155;">Retail price</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#2495D3;">{_fmt(retail)}</td></tr>'
        if wholesale is not None:
            rows += f'<tr><td style="padding:8px 0;color:#334155;">Wholesale price</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#2495D3;">{_fmt(wholesale)}</td></tr>'
    notes = f'<p style="color:#64748b;font-size:13px;margin-top:16px;">{quote.get("notes")}</p>' if quote.get("notes") else ""
    cust = quote.get("customer_name") or "Customer"
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid #2495D3;">
        <tr><td style="padding:20px 24px;">
          <div style="font-size:22px;font-weight:800;color:#0a0a0a;">Print <span style="color:#2495D3;">and</span> Save</div>
          <div style="font-size:11px;letter-spacing:2px;color:#64748b;text-transform:uppercase;">Your Brand in Focus</div>
        </td></tr>
      </table>
      <div style="padding:24px;">
        <p style="color:#0a0a0a;font-size:15px;margin:0 0 4px;">Hi {cust},</p>
        <p style="color:#334155;font-size:14px;margin:0 0 18px;">Here is your quote from Print and Save.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
          <tr><td style="padding:8px 0;color:#334155;">Service</td><td style="padding:8px 0;text-align:right;">{quote.get("module","")}</td></tr>
          <tr><td style="padding:8px 0;color:#334155;">Description</td><td style="padding:8px 0;text-align:right;">{quote.get("title","")}</td></tr>
          {rows}
        </table>
        {notes}
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Prices in CAD. This quote is an estimate and may vary. Reply to this email to place your order.</p>
      </div>
    </div>
    """

class QuoteEmailIn(BaseModel):
    recipient_email: EmailStr

@api_router.post("/quotes/{quote_id}/email")
async def email_quote(quote_id: str, body: QuoteEmailIn, user=Depends(get_current_user)):
    q = {"_id": ObjectId(quote_id)}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    quote = await db.quotes.find_one(q)
    if not quote:
        raise HTTPException(404, "Quote not found")
    quote = clean(quote)
    html = build_quote_html(quote, user.get("role"))
    payload = {
        "to": [body.recipient_email],
        "subject": f"Your quote from Print and Save — {quote.get('title','')}",
        "html": html,
        "from_name": os.environ["EMAIL_FROM_NAME"],
        "contact_email": user["email"],
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
    await db.quotes.update_one({"_id": ObjectId(quote_id)}, {"$set": {"emailed_to": body.recipient_email, "emailed_at": now_iso()}})
    return {"status": "success", "message": f"Quote emailed to {body.recipient_email}"}

@api_router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    return {
        "paper_stocks": await db.materials.count_documents({"modules": {"$in": ["paper", "booklet"]}}),
        "products": await db.products.count_documents({}),
        "roll_materials": await db.materials.count_documents({"modules": {"$in": ["large-format", "stickers"]}}),
        "equipment": await db.equipment.count_documents({}),
        "sticker_materials": await db.materials.count_documents({"modules": {"$in": ["large-format", "stickers"]}, "sticker_compatible": True}),
        "size_presets": await db.size_presets.count_documents({}),
        "garments": await db.garments.count_documents({}),
        "laser_materials": await db.materials.count_documents({"modules": "laser"}),
        "sheet_materials": await db.materials.count_documents({"modules": {"$in": ["direct-print", "channel-letters"]}}),
        "quotes": await db.quotes.count_documents({} if user.get("role") == "admin" else {"user_id": user["id"]}),
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
    await backfill_quote_inputs()
    await calibrate_default_ink()
    await unify_materials_clean()
    await seed_materials()
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

async def unify_materials_clean():
    """One-time: drop legacy per-module material tables and reset central materials so the
    unified single-source-of-truth starts clean (per user request)."""
    if await db.migrations.find_one({"_id": "unify_materials_clean_v2"}):
        return
    for coll in ["paper_stocks", "roll_materials", "laser_materials", "sheet_materials", "roll_sticker_materials"]:
        await db[coll].delete_many({})
    await db.materials.delete_many({})
    await db.migrations.delete_one({"_id": "materials_seed_v1"})
    await db.migrations.update_one({"_id": "unify_materials_clean_v2"}, {"$set": {"done": True}}, upsert=True)

async def seed_materials():
    if await db.migrations.find_one({"_id": "materials_seed_v1"}):
        return
    if await db.materials.count_documents({}) > 0:
        await db.migrations.update_one({"_id": "materials_seed_v1"}, {"$set": {"done": True}}, upsert=True)
        return
    samples = [
        {"name": "Coroplast 4x8 White 4mm", "code": "CORO-48-W", "category": "substrate",
         "supplier_company": "SignSupply Co.", "supplier_contact": "Dave Miller",
         "supplier_phone": "604-555-0182", "supplier_email": "orders@signsupply.example",
         "unit": "sqft", "size": "4x8 ft", "sheet_area_sqft": 32.0, "unit_cost": 0.55,
         "modules": ["direct-print"], "default_modules": ["direct-print"], "cnc_capable": True, "channel_capable": False,
         "stock_qty": 8, "reorder_point": 10, "reorder_target": 50},
        {"name": "ACM 4x8 3mm White", "code": "ACM-48-W", "category": "substrate",
         "supplier_company": "SignSupply Co.", "supplier_contact": "Dave Miller",
         "supplier_phone": "604-555-0182", "supplier_email": "orders@signsupply.example",
         "unit": "sqft", "size": "4x8 ft", "sheet_area_sqft": 32.0, "unit_cost": 2.20,
         "modules": ["direct-print", "channel-letters"], "cnc_capable": True, "channel_capable": True,
         "stock_qty": 25, "reorder_point": 8, "reorder_target": 40},
        {"name": "Eco-Solvent Vinyl 54in Gloss", "code": "VNL-54-G", "category": "roll",
         "supplier_company": "RollMedia Ltd.", "supplier_contact": "Sara Lee",
         "supplier_phone": "778-555-0110", "supplier_email": "sales@rollmedia.example",
         "unit": "sqft", "size": "54in x 150ft", "unit_cost": 0.85,
         "modules": ["large-format", "stickers"], "default_modules": ["large-format"],
         "roll_width": 54.0, "printable_width": 52.0, "min_linear_feet": 1.0,
         "material_type": "vinyl", "sticker_compatible": True,
         "stock_qty": 2, "reorder_point": 3, "reorder_target": 12},
        {"name": "Gloss Text 100lb 13x19", "code": "PPR-1319-G", "category": "sheet",
         "supplier_company": "PaperHouse", "supplier_contact": "Tom Ng",
         "supplier_phone": "604-555-0143", "supplier_email": "purchasing@paperhouse.example",
         "unit": "sheet", "size": "13x19 in", "gramage": "148 gsm", "unit_cost": 0.15,
         "modules": ["paper", "booklet"], "default_modules": ["paper"],
         "sheet_width": 13.0, "sheet_height": 19.0, "sheets_per_box": 500,
         "stock_qty": 1200, "reorder_point": 500, "reorder_target": 3000},
        {"name": "1/8in Baltic Birch 24x18", "code": "BIRCH-18", "category": "substrate",
         "supplier_company": "WoodStock", "supplier_email": "sales@woodstock.example",
         "unit": "sheet", "size": "24x18 in", "unit_cost": 8.0,
         "modules": ["laser"], "sheet_width": 24.0, "sheet_height": 18.0,
         "stock_qty": 30, "reorder_point": 10, "reorder_target": 60},
        {"name": "Gloss Label Roll 4in", "code": "LBL-4-G", "category": "roll",
         "supplier_company": "RollMedia Ltd.", "supplier_email": "sales@rollmedia.example",
         "unit": "roll", "size": "4in x 1000pc", "unit_cost": 60.0,
         "modules": ["roll-stickers"], "pieces_per_roll": 1000, "roll_width": 4.0,
         "sticker_w": 3.0, "sticker_h": 3.0,
         "stock_qty": 5, "reorder_point": 3, "reorder_target": 15},
    ]
    for s in samples:
        s["created_at"] = now_iso()
        await db.materials.insert_one(s)
    await db.migrations.update_one({"_id": "materials_seed_v1"}, {"$set": {"done": True}}, upsert=True)

async def calibrate_default_ink():
    # Realistic ink defaults derived from the user's real VersaWorks readings. Runs ONCE.
    if await db.migrations.find_one({"_id": "ink_defaults_v1"}):
        return
    presets = [
        (["VP-540i", "XR-640", "RE-640"], 0.80, 0.205),   # Roland eco-solvent (440ml @ $90)
        (["UCJV300"], 1.00, 0.31),                          # Mimaki UV-LED roll (1L @ $310)
        (["LEJ-640", "LEF2-200"], 1.60, 0.65),              # Roland UV flatbed (500ml @ $315)
    ]
    for names, mlpsf, cpm in presets:
        for nm in names:
            await db.machines.update_many(
                {"name": {"$regex": nm}, "$or": [{"ink_samples": {"$exists": False}}, {"ink_samples": 0}]},
                {"$set": {"ink_ml_per_sqft_full": mlpsf, "ink_cost_per_ml": cpm}})
    await db.migrations.update_one({"_id": "ink_defaults_v1"}, {"$set": {"done": True}}, upsert=True)

def _reconstruct_inputs(module, s):
    """Best-effort rebuild of calculator inputs from a saved quote summary.
    Only returns inputs for modules whose summary fully captures the config; otherwise {}."""
    try:
        if module == "Paper":
            row = s.get("row") or {}
            return {
                "productId": (s.get("product") or {}).get("id"),
                "sheet": s.get("sheet"),
                "side": s.get("side"),
                "focusQty": s.get("focus_qty"),
                "laminate": bool(row.get("lamination")),
            }
        if module == "Stickers":
            return {"w": s.get("width"), "h": s.get("height"), "qty": s.get("qty"),
                    "finishing": s.get("finishing"), "laminate": bool(s.get("laminate"))}
        if module == "Sublimation":
            return {"productId": (s.get("product") or {}).get("id"), "qty": s.get("quantity")}
        if module == "Roll Stickers":
            return {"matId": (s.get("material") or {}).get("id"), "qty": s.get("quantity")}
    except Exception:
        return {}
    return {}

async def backfill_quote_inputs():
    cursor = db.quotes.find({"$or": [{"inputs": {"$exists": False}}, {"inputs": {}}]})
    async for q in cursor:
        inp = _reconstruct_inputs(q.get("module"), q.get("summary") or {})
        inp = {k: v for k, v in inp.items() if v is not None}
        if inp:
            await db.quotes.update_one({"_id": q["_id"]}, {"$set": {"inputs": inp}})

async def seed_demo():
    if await db.products.count_documents({}) == 0:
        prods = [
            {"name": "Business Card", "finished_w": 3.5, "finished_h": 2.0, "bleed_w": 3.75, "bleed_h": 2.25},
            {"name": "Postcard 4x6", "finished_w": 6.0, "finished_h": 4.0, "bleed_w": 6.25, "bleed_h": 4.25},
            {"name": "Flyer 8.5x11", "finished_w": 8.5, "finished_h": 11.0, "bleed_w": 8.75, "bleed_h": 11.25},
        ]
        for p in prods:
            p["created_at"] = now_iso()
        await db.products.insert_many(prods)
    if await db.equipment.count_documents({}) == 0:
        eqs = [
            {"name": "Ricoh Pro C7200", "module": "paper", "ink_config": "CMYK", "cartridge_ml": 500, "ink_price": 180.0, "ink_consumption_ml_sqft": 0.4, "maintenance_pct": 6.0},
            {"name": "Xerox Versant 280", "module": "paper", "ink_config": "CMYK", "cartridge_ml": 500, "ink_price": 190.0, "ink_consumption_ml_sqft": 0.4, "maintenance_pct": 6.0},
            {"name": "Konica AccurioPress C3080", "module": "paper", "ink_config": "CMYK", "cartridge_ml": 500, "ink_price": 200.0, "ink_consumption_ml_sqft": 0.4, "maintenance_pct": 7.0},
            {"name": "Roland TrueVIS", "module": "largeformat", "ink_config": "CMYK + Wh", "cartridge_ml": 500, "ink_price": 220.0, "ink_consumption_ml_sqft": 0.6, "maintenance_pct": 8.0},
            {"name": "Glowforge Pro", "module": "laser", "ink_config": "N/A", "cartridge_ml": 0, "ink_price": 0.0, "ink_consumption_ml_sqft": 0.0, "maintenance_pct": 5.0},
            {"name": "xTool F2", "module": "laser", "ink_config": "N/A", "cartridge_ml": 0, "ink_price": 0.0, "ink_consumption_ml_sqft": 0.0, "maintenance_pct": 5.0},
            {"name": "SureColor F570", "module": "sublimation", "ink_config": "CMYK", "cartridge_ml": 140, "ink_price": 70.0, "ink_consumption_ml_sqft": 0.35, "maintenance_pct": 5.0},
            {"name": "Epson ColorWorks C6000A", "module": "rollsticker", "ink_config": "CMYK", "cartridge_ml": 50, "ink_price": 45.0, "ink_consumption_ml_sqft": 0.3, "maintenance_pct": 6.0},
        ]
        for e in eqs:
            e["created_at"] = now_iso()
        await db.equipment.insert_many(eqs)
    if await db.sublimation_products.count_documents({}) == 0:
        await db.sublimation_products.insert_many([
            {"name": "11oz Mug", "category": "mug", "model": "AA-11", "price_per_box": 36.0, "pieces_per_box": 36, "cost_per_unit": 0.0, "uses_paper": True, "print_bleed_w": 8.75, "print_bleed_h": 3.75, "created_at": now_iso()},
            {"name": "Photo Frame 8.5x11", "category": "frame", "model": "FR-811", "price_per_box": 120.0, "pieces_per_box": 24, "cost_per_unit": 0.0, "uses_paper": True, "print_bleed_w": 8.75, "print_bleed_h": 11.25, "created_at": now_iso()},
            {"name": "Metal Keychain", "category": "keychain", "model": "KC-2", "price_per_box": 50.0, "pieces_per_box": 100, "cost_per_unit": 0.0, "uses_paper": True, "print_bleed_w": 2.25, "print_bleed_h": 1.25, "created_at": now_iso()},
        ])
    if await db.size_presets.count_documents({}) == 0:
        presets = [
            {"name": "Yard Sign 24x18", "width": 24, "height": 18, "created_at": now_iso()},
            {"name": "Banner 96x36", "width": 96, "height": 36, "created_at": now_iso()},
            {"name": "Decal 12x12", "width": 12, "height": 12, "created_at": now_iso()},
        ]
        await db.size_presets.insert_many(presets)
    if await db.garments.count_documents({}) == 0:
        await db.garments.insert_many([
            {"name": "Gildan 5000 T-Shirt", "category": "tshirt", "cost_each": 4.50, "created_at": now_iso()},
            {"name": "Bella Canvas 3001", "category": "tshirt", "cost_each": 6.00, "created_at": now_iso()},
            {"name": "Gildan 18500 Hoodie", "category": "hoodie", "cost_each": 14.00, "created_at": now_iso()},
        ])
    if await db.fixed_costs.count_documents({}) == 0:
        await db.fixed_costs.insert_many([
            {"label": "Rent", "category": "rent", "amount": 6500.0, "notes": "", "created_at": now_iso()},
            {"label": "Payroll (3 full-time)", "category": "payroll", "amount": 11700.0, "notes": "3 x $22.5/h x 8h x 5d x 4.33 wk", "created_at": now_iso()},
            {"label": "Electricity", "category": "utilities", "amount": 160.0, "notes": "", "created_at": now_iso()},
            {"label": "Internet & Phone", "category": "utilities", "amount": 165.0, "notes": "", "created_at": now_iso()},
            {"label": "Miscellaneous (fuel, vehicle upkeep)", "category": "misc", "amount": 500.0, "notes": "", "created_at": now_iso()},
        ])
    if await db.machines.count_documents({}) == 0:
        def mach(name, category, acq, price=0.0, lease=0.0, term=48.0, life=7.0, ink="", details="", notes=""):
            return {"name": name, "category": category, "acquisition": acq, "purchase_price": price,
                    "lease_monthly": lease, "lease_term_months": term, "useful_life_years": life,
                    "maintenance_pct_year": 2.0, "productive_hours_month": 0.0, "ink_config": ink,
                    "ink_details": details, "notes": notes, "created_at": now_iso()}
        await db.machines.insert_many([
            mach("Mimaki UCJV300-160", "largeformat", "owned", 40000.0, ink="CMYK+CL+WH", details="8 x 1L @ $310/L"),
            mach("Roland SOLJET Pro 4 XR-640", "largeformat", "owned", 16000.0, ink="CMYK+Lm/Lc/Lk+WH", details="8 x 440ml @ $90"),
            mach("Roland VersaCAMM VP-540i", "largeformat", "owned", 7500.0, ink="CMYK", details="4 x 440ml @ $90"),
            mach("Roland VersaArt RE-640", "largeformat", "owned", 10000.0, ink="Double CMYK", details="8 x 440ml @ $90"),
            mach("Roland VersaUV LEJ-640FT", "directprint", "owned", 75000.0, ink="CMYK+WH", details="6 x 500ml CMYK @ $315 + 2 x 220ml WH @ $195"),
            mach("Roland VersaUV LEJ-640", "directprint", "owned", 0.0, ink="CMYK+WH", details="6 x 500ml CMYK @ $315 + 2 x 220ml WH @ $195", notes="Purchase price pending"),
            mach("Roland VersaUV LEF2-200", "directprint", "owned", 20000.0, ink="CMYK+CL+WH", details="@ $195 ea"),
            mach("xTool F2 Ultra", "laser", "owned", 6000.0),
            mach("xTool M1 Ultra", "laser", "owned", 2500.0),
            mach("Glowforge Pro", "laser", "owned", 7500.0),
            mach("Konica AccurioPress C3080", "laserprint", "leased", 0.0, 1300.0, 48.0, 4.0, "CMYK", "Toner $50 ea + click", "4-year lease"),
            mach("Xerox Versant 280", "laserprint", "leased", 0.0, 1550.0, 60.0, 5.0, "CMYK", "Toner + click", "5-year lease"),
        ])

@app.on_event("shutdown")
async def shutdown():
    client.close()
