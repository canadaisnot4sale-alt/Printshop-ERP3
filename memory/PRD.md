# Print and Save — Print Shop ERP & Estimating

## ⏳ PENDING / USER-REQUESTED (remind the user — deferred by them on 2026-06)
- **Sales Dashboard** (Phase 5 sales analytics). User explicitly asked for this and said "lo hacemos más adelante, recuérdamelo":
  - **Break-even multi-period**: how much to sell per DAY / WEEK / MONTH / YEAR to cover costs (currently only monthly exists in /financials).
  - **Best-selling product** ranking (by units & revenue, with period filter) — does NOT exist yet.
  - **Real earnings consolidated**: day/week/month/year sales vs break-even target.
  - NOTE: best-seller & real sales depend on Orders/Store; if user bills outside the app, ask how sales are recorded so the report is faithful.


## Original Problem Statement
Excel-style ERP/estimating system for a print shop automating pricing, material management, production calculations and cost analysis across 5 modules: Paper Printing, Booklet, Large Format, Sticker Calculator, Equipment & Production Cost. Everything interconnected so material/equipment/markup/product changes flow through all quotes.

## User Choices
- Cover ALL modules at a basic level in v1
- Auth: JWT email + password
- Currency: CAD, units: inches
- Brand: "Print and Save", slogan "Your Brand in Focus", colors white/black/blue #2495D3 (text logo for now; user has a logo to upload later)
- Editable pricing defaults

## Architecture
- Backend: FastAPI + MongoDB (motor). JWT (bcrypt + PyJWT). All routes under /api.
- Frontend: React 19 + react-router + Tailwind + shadcn/ui, axios (Bearer token in localStorage `pns_token`).
- Fonts: Chivo (headings), Manrope (body), IBM Plex Mono (numbers).

## Implemented (2026-07-19)
- JWT auth (register/login/logout/me), admin auto-seed (admin@printandsave.ca / admin123), demo data seed.
- Paper Printing: paper stock CRUD (name/size/sheets-per-box/cost-per-box/auto cost-per-sheet), product CRUD (finished + bleed size); imposition with rotation (pieces-per-sheet), pricing comparison across all stocks for qtys 25–5000 with material/4-0/4-4/customer/wholesale + optional lamination.
- Booklet: cover+inside paper, page count, 4 binding types, optional laminated cover, production cost + unit price.
- Large Format: roll material CRUD (roll/printable width, $/sqft, min linear feet, sticker flag, type), size preset CRUD, up to 25-size estimating grid, 3 finishing modes, nesting fit + auto-tiling with configurable overlap, min charge, material comparison.
- Sticker Calculator: 1–8" sliders, qty, sticker-compatible materials only, comparison + unit price.
- Equipment: printer CRUD (ink config, cartridge ml, ink price, consumption, maintenance %), true cost/sqft analysis.
- Settings: editable retail/wholesale markups, click charges, lamination (paper + LF), die-cut/transfer, tiling overlap, binding costs — flows through all quotes.
- Tested: 18/18 backend, full frontend E2E — all passing.

## Backlog
- P1: Save/recall estimates & quote history; export quote to PDF.
- P1: Logo upload (object storage) to replace text wordmark.
- P2: True multi-job 2D nesting visualization; fair cost-split UI for shared print sections.
- P2: Brute-force login lockout; dark mode toggle.
- P2: Standardize sticker calc material shape (string -> dict).

## Implemented (2026-07-19) — v2
- 3 ROLES (RBAC + server-side field-level price scrubbing): admin (full access + edit + costs + all prices), client (retail prices only, read-only), reseller (wholesale prices only, read-only). Self-registration defaults to `client`; admin promotes via Users page. All CRUD/settings writes gated by `require_admin`; non-admin gets 403 and admin routes redirect in UI.
- User management page (admin): list users, change role, delete (with self-guards).
- 5 NEW MODULES: DTF/Playeras (garment + DTF by area + labor), Bordados (per-1000-stitches + digitizing + garment), Láser (sheet material + cut length + engraving), Impresión Directa UV (sheet materials 4x8/5x10, per-sqft print, optional CNC cut, material comparison), Channel Letters (auto letters-per-sheet, heights 6"–48", channel-capable materials). Each with editable defaults in Settings.
- Logo integrated (login + sidebar). Save Quote + PDF/print on every calculator; Quotes page (users see own, admin sees all).
- Verified: 31/31 RBAC+module backend tests, 18/18 existing, full frontend E2E for all 3 roles — all passing.

Note: Direct Print & Channel Letters use full-sheet material costing (whole sheet billed regardless of n-up) — standard for sign shops buying full sheets.

## Backlog (updated)
- v5 SUBLIMATION + ROLL STICKERS + PRICE CATALOG + Equipment-by-module & supplies shipped (2026-07-19).
- v4 EMAIL + English + nesting + presets shipped (2026-07-19).
- P1: PDF quote as branded document (currently browser print); email quote.
- P2: True multi-job 2D nesting visualization; split cost UI for shared sections.
- P2: Brute-force login lockout; dark mode; split server.py into modules.

## Implemented (2026-07-23) — v21 P2a: E-commerce storefront + Orders + auto-inventory (no payment yet)
- **Storefront** (/store, all roles): published products grouped by category; **role-based price** (client=retail, reseller=wholesale, admin sees both). Cart + checkout → creates an Order.
- **Products** now have `price` (retail) + `wholesale_price` + a **Bill-of-Materials** (bom: [{material_id, qty_per_unit}]) editable in the Products page. Convert-to-product also captures wholesale.
- **Auto inventory deduction on order**: for each line, deduct qty_per_unit × qty per BoM material; PLUS each material's **`waste_per_order`** applied ONCE per material per order (waste field editable per material in Materials page, in the material's own unit — sheets/ft/ft²/inches/pieces). Verified: 100 BC (5 sheets) + 1 waste = 6; multi-item same material = waste once.
- **Orders** (/orders): history + printable **invoice**; admin sees all + inventory-deduction detail + status control (pending/paid/fulfilled/cancelled); DELETE order (admin). Clients/resellers see only their own.
- **Profit dashboard** now includes **REAL SALES** (orders, excl. cancelled): new `sales` + `net_real` per month; KPI + chart bar/line updated to real sales.
- RBAC verified; clients don't see wholesale/bom. Verified iteration_17 = 16/16 backend + 100% frontend, no bugs. Test data cleaned.

### P2b (next): online payment — Stripe + PayPal at checkout.

## Implemented (2026-06) — v22 P2b: Stripe payments at checkout
- **Backend Stripe** (server.py, uses emergent Sandbox keys in .env): `POST /api/payments/checkout` (creates Stripe Checkout Session for an existing order, currency CAD, records a `payment_transactions` row), `GET /api/payments/status/{session_id}` (polls Stripe + marks order paid), `POST /api/stripe/webhook` (signature-verified, marks order paid on checkout.session.completed). Added `import stripe` (was missing → server crashed; fixed).
- **Frontend**: Storefront checkout dialog now has **Place order** + **Place & pay** (place-and-pay-button) → redirects to Stripe. Orders page: pending orders show a **Pay now** button (row + invoice dialog) → `/payments/checkout` → Stripe redirect. New **PaymentReturn.js** page on routes `/payment/success` (polls status, shows "Payment successful!") and `/payment/cancel`. On success the order flips pending → paid.
- Verified iteration_18 = 100% backend (5/5 pytest) + full frontend E2E through the real Stripe hosted page (test card 4242…) incl. order status flip and cancel route. No bugs.

### P2b remaining: PayPal at checkout (needs user's PayPal Client ID + Secret).

## Implemented (2026-06) — v23 UNIFIED MATERIALS (single source of truth)
- **Central Materials DB is now the ONLY place to create/edit materials.** Each material is assigned to one or more modules; every calculator reads its materials directly from the central `materials` collection (filtered by assigned modules). Editing a material's unit_cost/specs flows automatically to all modules, quotes and inventory. "Do the work once."
- **Material model extended** with optional module-specific specs shown conditionally in the central editor: sheet_width/height + sheets_per_box (paper/laser), roll_width/printable_width/min_linear_feet/material_type/sticker_compatible (large-format/stickers), cnc_capable/channel_capable (direct-print/channel-letters), pieces_per_roll/sticker_w/h (roll-stickers). Nickname (name) + unit_cost + price_override already existed.
- **Backend**: COLLECTION_MODULES + map_material() map central materials into each legacy per-module shape; register_material_view() makes the 5 per-module endpoints (paper-stocks, roll-materials, laser-materials, sheet-materials, roll-sticker-materials) READ-ONLY (GET reads central; POST/PUT/DELETE → 400 "managed centrally"). All 8 calc endpoints rewritten to read central. apply_links/LINK_COST_FIELD removed. unify_materials_clean() migration drops legacy per-module collections + resets materials for a clean start. 6 complete demo materials seeded.
- **Frontend**: per-module material tabs are now read-only reference views (CrudManager `readOnly` prop → no Add/edit/delete, shows "Manage in Materials →" link + note). Central Materials page gained the conditional "Module specs" section.
- Verified iteration_19 = backend 29/29 (calc from central, write-block 400s) + frontend 100% (central editor with module specs, all 5 tabs read-only, calculators compute from central). No bugs.
- NOTE: DTF/Embroidery (garments) and Sublimation (blanks) remain their own small editable catalogs — they are finished blanks/garments, not raw sheet/roll materials.

## Implemented (2026-06) — v24 Per-module default material + dynamic product pricing + per-product waste
- **Default material PER MODULE**: Material gained `default_modules[]`. In the central Materials editor, for each assigned module you can toggle "Default for this module" (Star). Opening a module's calculator pre-selects that module's default material (backend marks is_default + sorts default-first per `?module=`; calculators' setSel prefers `is_default`). Only one default per module (`_apply_default_modules`).
- **Dynamic product pricing from BoM**: CatalogProduct gained optional retail/wholesale markup overrides. `compute_product_pricing()` computes unit cost = Σ(material.unit_cost × qty_per_unit) and derives retail/wholesale from markups. list_catalog_products + create_order use it → changing a material cost re-prices every product built from it automatically. Products without a BoM keep manual price.
- **Per-PRODUCT waste**: each BoM line has `waste_per_order` (once per order) + `waste_per_unit` (× qty), used by deduct_inventory_for_order. Smart SUGGESTION: GET /api/products/waste-suggestion averages waste from similar products (same category/module) and pre-fills the BoM row on material pick.
- Verified iteration_20 = backend 7/7 + frontend 100%. No bugs.

## Implemented (2026-06) — v25 Machine Maintenance & Service Log (post-deploy)
- Removed the duplicate **"Equipment"** page (Administration); consolidated into **"Machinery"** (Business). Verified no calculator/ink/profit flow depended on it (all use `/machines`).
- New per-machine **Maintenance & Service Log** inside /machinery (component MachineMaintenance.js):
  - Log entries (service/part/cleaning/repair/other) with supplier, part #, cost, date; **invoice upload to Emergent object storage** (POST /api/upload/invoice, GET /api/files/{id}/download with ?auth= or Bearer). Files tracked in `files` collection (soft-delete).
  - **Cleaning cost** = technician hourly rate × time chosen via slider + presets (15/30/45/60/90/120 min); rate default from Settings.technician_hourly_rate ($65), editable per entry.
  - **Recurring schedules** (parts every 1/2/3/6/12/24 mo) + non-recurring one-time toggle → computes next-due, raises **in-app reminders** (overdue/due-soon) with badge + list (GET /api/machines/maintenance/alerts).
  - **Year-end tax report** (GET /api/machines/maintenance/tax-report?year=) totaling deductible maintenance per machine + by type.
  - Collections: machine_logs, machine_schedules, files. Settings.technician_hourly_rate added (Settings page "Maintenance & Labor" group).
  - Storage init at startup; requests added to requirements. Silenced benign ResizeObserver overlay + added DialogDescription for a11y.
- Verified iteration_22 = backend 9/9 + frontend 100%. No bugs.

## Implemented (2026-06) — v26 Category-driven material form + supplier presets (Paper focus)
- **Materials vs Purchases** clarified for user: Materials = master catalog + inventory (single source of truth); Purchases = buying/invoice events that auto-update a material's cost + stock (or create it, incl. PDF parse).
- Material form is now **category-driven**: Categories Paper/Roll/Substrate + custom "＋ Add category"; Unit sheet/sqft/each + custom "＋ Add unit" (removed "roll"); **Gramage removed** (Weight kept — same property, lb↔gsm); Sheet area (ft²) shown only for Substrate.
- **PAPER category** specs: Size, Weight, Sheets per box, Number of boxes, Price per box. **Auto**: unit_cost = price_per_box/sheets_per_box; stock = num_boxes×sheets_per_box (live hint). Cost&Pricing shows Machine + **Click cost/side** (Ink coverage hidden for paper) + live **printed-cost panel** (Blank / Printed 1 side = paper+click / Printed 2 sides = paper+2·click). Labor left 0 for paper (option a). Waste per order defaults to 1.
- **Supplier presets**: new `suppliers` collection + GET/POST(upsert)/DELETE /api/suppliers; form has "Save preset" toggle + "Load preset…" dropdown that auto-fills company/contact/phone/email.
- Backend Material fields added: num_boxes, price_per_box, click_cost. Registered real example material "100lb uncoated text" (Alfa Paper).
- Verified iteration_23 = backend 4/4 + frontend 100%. No bugs.

## Implemented (2026-06) — v27 ROLL category form (large-format materials)
- Roll category form: Unit auto='roll'; Specs = Printable width, Printable height/length, Material type; Cost&Pricing = Roll cost, Quantity (rolls), Machine (ink source), Waste/order (linear ft). Auto: roll_width parsed from Size; unit_cost(price_per_sqft)=roll_cost/roll_area; stock=rolls×area; waste_per_order(sqft)=linear_ft×roll_width_ft.
- Live panel: **Material $/ft²**, **Ink $/ft² (100%)** = selected machine's ink_ml_per_sqft_full × ink_cost_per_ml, **Printed $/ft²** = material+ink. Roll fields added to Material model (roll_cost, roll_qty, printable_height, waste_linear_ft).
- Registered real example: "#20 (3641MV52) 3641 Matte Vinyl 52\"" (Grimco) → $0.3196/ft², 675 ft² stock, waste 4.5 ft².
- Verified iteration_25 = frontend 100% (after fixing a missing Specs block found in iteration_24). No bugs.
- **Inventory value fix**: for roll materials, value = roll_cost × rolls (not unit_cost/ft² × rolls). Verified iteration_26 (100%).
- **Category filter** on Materials page: client-side chips (All + one per category with counts) filter the table; metrics stay global. Verified iteration_27 (100%).

## Fix (2026-06) — v39.1 Exclude laminate/foil from paper comparison
- calc_paper now filters out paper_type=laminate/hot_foil (they are add-ons, not paper stocks) from the Compare Papers list; Paper Stocks reference tab also excludes them. Verified: Velvete laminate no longer appears as a paper option.

## Implemented (2026-06) — v47 Southwest laminate import + supplier auto-persist
- **Southwest supplier training**: `SUPPLIER_MODULE_RULES` adds southwest → default category "laminate". Laminate-film lines auto-detected (keywords: laminating/velvet touch/OPP/PET lite/soft touch — kept specific so Grimco wide-format "GC LUS LAM" rolls stay category=roll). `_import_line_spec` "laminate" branch stores category=paper + paper_type=laminate + lam_width_in/lam_length_ft/lam_roll_cost, unit_cost=$/linear ft, stock in rolls, module=paper. Handles fractional widths ("12 3/4" → 12.75). Stored category translated laminate→paper via `store_cat`.
- **Supplier info auto-persist**: editing a material's supplier Company/Contact/Phone/Email now upserts the supplier record (`_upsert_supplier_from_material`, only non-empty values). `create_purchase` supplier training no longer overwrites saved contact/phone/email with blanks. `parse_purchase` backfills missing supplier contact/phone/email from the trained supplier record → next PDF import auto-fills them.
- Verified: curl e2e (Southwest laminate import → paper/laminate materials with correct specs; manual material edit → supplier updated → re-parse auto-fills contact/phone/email). 9/9 unit tests pass.

## Implemented (2026-06) — v46 Double-sided (4/4) surcharge %
- Paper 4/4 selling price now = 4/0 printing price × (1 + `double_sided_surcharge_pct`), default **20%**, applied equally to retail & wholesale. Previously 4/4 only added the 2nd-side click cost (cents difference). Add-ons (laminate/foil/round-corner) are priced on top and NOT surcharged. True production cost (base_cost_4_4) unchanged. Configurable in Settings → "Paper Click Charges & Lamination" → "Double-sided (4/4) surcharge %". Verified via curl (4/4 = 4/0 × 1.2 for retail & WS).

## Fix (2026-06) — v45.4 Duplicate Sheet Size option (12"x18" + 18"x12")
- **Bug**: a paper stored with a rotated size (e.g. "18x12") was appended to the Sheet Size dropdown as a separate option, duplicating "12x18".
- **Fix**: `canonSheet()` normalizes any WxH to ascending-dim canonical form ("18x12" → "12x18") wherever the sheet key is set/displayed (dropdown value, options list, default-size hook, requote, selectStock, calc). Dropdown now shows a single clean list. Verified via screenshot.

## Fix (2026-06) — v45.3 Paper Sheet Layout followed paper's stored size (orientation flip) + inch-mark label
- **Bug**: v43.2 made the MAIN Sheet Layout use the selected paper's stored native size. A paper stored as "18x12" flipped the layout to landscape even though the user picked "12x18" in the dropdown (same sheet, rotated).
- **Fix**: `calc_paper` main quote now always uses the dropdown `sheet_key`; each paper's native size is computed separately as `native` (only when it's a genuinely different sheet, sorted-dims aware) and used ONLY by the Compare Papers cards (n_up/sheets/price + native size label). Dropdown controls main layout/pricing; clicking a compare card still auto-switches the dropdown to that paper's size.
- Also fixed sheet-size label formatting to show inch marks on both dims (e.g. `12"x18"`) in the dropdown and Sheet Layout header. Verified via screenshot (vertical 12"x18" layout).

## Implemented (2026-06) — v45.2 Default reorder point/target on imported materials
- New materials created via PDF import now get sensible reorder defaults: `reorder_target` = stock purchased (refill back to what was bought), `reorder_point` = 100 sheets for paper, 1 sheet for substrate, 0 otherwise. Matched (existing) materials are NOT touched. Verified via curl (paper import → point=100, target=750).

## Fix (2026-06) — v45.1 Paper inventory unit clarity (reorder / waste)
- **Confusion**: paper inventory (stock, reorder point/target, waste per order) is counted in individual SHEETS, but the "Waste per order" label used the purchase unit "M Sheets" (implying 1 = 1000 sheets) and reorder fields had no unit label.
- **Fix (labels only, no calc change)**: reorder point/target and waste-per-order labels now show "(sheets)" for paper & substrate ("(rolls)" for roll) via `invUnit`. Added a note: stock/reorder/waste are all in individual sheets — e.g. reorder point 100 = reorder at 100 sheets left; waste per order 1 = 1 sheet scrapped per job. Backend reorder logic (`low_stock = stock <= reorder_point`) already operates in sheets; waste_per_order feeds product BoM as sheets. No behavior change, only clearer UI.

## Implemented (2026-06) — v45 View/download original invoice PDF from Purchases
- The uploaded invoice PDF is now stored in object storage during `/purchases/parse` (file record in `db.files`); `pdf_file_id`/`pdf_filename` flow through `PurchaseIn` → saved on the purchase doc → returned by `GET /purchases`.
- Purchases list rows show a FileText icon linking to `/api/files/{id}/download?auth=<token>` (opens/downloads the original PDF). Only appears for invoices imported after this change. Verified via curl e2e (parse stores PDF → download returns valid application/pdf, exact byte match).

## Fix (2026-06) — v44.2 Imported paper: empty Supplier description + box fields
- **Bug**: newly-created materials from PDF import never stored `supplier_description` (only matched ones did), and imported paper left `sheets_per_box`/`price_per_box`/`num_boxes` at 0 (cost still correct via unit_cost).
- **Fix**: create doc now stores `supplier_description`. Paper bought in M now back-fills box helpers consistently (1 box = 1 M = `mult` sheets → sheets_per_box=mult, price_per_box=unit_cost×mult, num_boxes=qty, unit="M Sheets"). Note: saving an imported paper with sheets_per_box=0 does NOT wipe unit_cost (frontend skips the box recompute). Verified via curl e2e. NOTE: preview DB was empty (user's data was on production) — user must re-import + Re-publish.

## Fix (2026-06) — v44.1 Paper misdetected as substrate on PDF import (Grimco detection bug)
- **Bug**: after v44, Alfa paper lines (descriptions like `18"x12"`, `12"x18"`) were auto-classified as **substrate** because any inch×inch dimension matched. This gave them unit=sqft, wrong stock (1.2 instead of 1200) and wrong $/ft², and lost the paper "printed 1/2 sides" pricing.
- **Root cause**: `_detect_media_category` treated ANY inch×inch as substrate. Paper is also sold in inch sheets.
- **Fix**: inch×inch is only treated as a rigid substrate when it's a LARGE sheet (max side ≥ 40" → 48x96 / 60x120); small sheets fall back to the invoice default (paper for Alfa). Cleaned up the 2 wrongly-created materials + bad purchase. Regression test added (7/7 pass). User to re-import the Alfa invoice.

## Implemented (2026-06) — v44 Grimco supplier import: per-line roll vs substrate detection + unit conversion
- **Mixed invoice support**: PDF import now detects EACH line as roll or substrate (YD/FT length → roll; inch×inch → substrate; + keyword hints ORAJET/BRITELINE/vinyl/banner vs ACM/coroplast/acrylic/max-metal/PVC). Per-line editable **Category** dropdown added to the review table.
- **Unit conversion** (`_import_line_spec`): ROLL → unit_cost=$/ft² (roll_cost ÷ (width_ft × length_ft), YD×3→ft), stock=rolls×area ft², sets roll_width/printable_width(−2)/roll_cost/roll_qty/material_type, modules=[large-format]. SUBSTRATE → unit_cost=$/ft² (sheet_price ÷ area), stock=sheets, sets sheet_area_sqft/sheet_price/sheet_width/height/cnc_capable/channel_capable, size label 4x8 / 5x10, modules=[direct-print, laser, channel-letters].
- **Laser on rigid substrates**: `map_material` laser now uses `sheet_price` as cost_per_sheet (falls back to unit_cost) so laser quotes rigid sheets by the real per-sheet price. Verified with real Grimco invoices #60460 & #67306.
- **Delete reversal** made category-aware (reverses ft² for rolls, sheets for substrates). Backend tests: /app/backend/tests/test_grimco_import.py (6/6) + curl e2e (create mixed → verify → delete reversal). User to verify by uploading a real Grimco PDF.

## Implemented (2026-06) — v43.2 Compare Papers: tax-included blue price + per-paper native size
- **Tax-included blue price**: each Compare Papers card's big blue number now shows the price WITH tax (Retail incl. GST+PST via `retailTaxF`; reseller/WS = incl. GST only via `wsTaxF`) + an "incl. tax" label; WS sub-line also tax-included. Matches the "TOTAL INCL. TAX" panel.
- **Per-paper native size**: `calc_paper` now quotes each paper at ITS OWN sheet size (material `size` field → fallback derived from the paper name via `_extract_size` → fallback `body.sheet_key`). Added `_parse_dims()`; `paper_quote` parses non-preset sheet keys. Result: Copy Paper 8.5x11 → 8-up·13 sheets, Bond 8.5x14 → 10-up, 12x18 → 20-up — cards no longer all change together when one is clicked. Verified via curl + screenshot. User-confirmed.

## Fix (2026-06) — v43.1 PDF import: paper category default + size extraction
- **Category default fixed**: Alfa Paper supplier rule + trained supplier doc now default new materials to `paper` (was `sheet`); added `paper` to the import dialog's category dropdown. New PDF-imported paper now behaves identically to manually-registered paper (printed 1/2 sides options).
- **Size extraction fixed**: `_extract_size()` regex now tolerates inch marks (`18"x12"` → `18x12`); returned by `/purchases/parse` per line and shown as an editable **Size** column in the review table (data-testid `draft-line-size-{i}`). `PurchaseLine.size` stored + used on create (fallback to regex). Verified with real Alfa invoice #176837. User-confirmed working.

## Implemented (2026-06) — v43 Trainable supplier invoice import (unit conversion + code auto-match)
- **Supplier unit rule** (trained once): SupplierPreset gains unit_multiplier + unit_label (+ default_category/modules). Alfa Paper seeded ×1000 ("M Sheets"). Saving a purchase upserts the supplier rule (auto-trained). /purchases/parse looks up the supplier → attaches supplier_unit_multiplier, per-line converted_qty/converted_unit_cost, and auto-match material_id by code.
- **Unit conversion on import**: create_purchase converts invoice units → real stock. qty_units = quantity × unit_multiplier; unit_cost = line_total / qty_units (fallback unit_price/mult). Verified via curl: Alfa 0.4 M @ $254/M ($101.60 box) → +400 sheets, $0.254/sheet. Remembers supplier code on the matched material for future auto-match.
- **Review screen** (Purchases import dialog): "Unit ×" field, per-line "→ Stock" and "→ $/unit" converted preview, green "matches: <material>" hint when auto-matched by code. Confirm-once workflow; material_id + unit_multiplier sent to backend.
- **Description alias match**: Material gains supplier_description (paste the exact vendor invoice description in the Materials form). Import matches by material_id → code → supplier_description → name. On match it remembers the code/description on the material. Verified via curl: material with only supplier_description (no code) matched an invoice line → +400 sheets, $0.254.
- **Duplicate invoice guard**: create_purchase rejects (HTTP 409) a purchase whose supplier company + invoice_number already exist, with a clear message. Prevents double-importing the same PDF (and double-counting inventory).
- **Inventory reversal on delete**: DELETE /purchases/{pid} now reverses the stock the invoice added (only when update_inventory was true) — re-matches each line (material_id→code→supplier_description→name) and subtracts quantity×unit_multiplier. Returns `reversed[]`; frontend confirms and toasts how many materials were reversed. Verified via curl (100→500 on import, back to 100 on delete).
- Verified end-to-end via curl; frontend compiles. NOTE: full Purchases UI flow not yet run through testing_agent.


## Implemented (2026-06) — v42 Round Corners (stack-based) + Rush Pricing (all modules)
- **Round Corners**: stack-based add-on charged on PAPER (Paper Printing) and SUBSTRATE (Direct Print). charge = max(min, ceil(qty/pieces_per_stack) × cost_per_stack), then marked up to retail/wholesale (added to DISCOUNTABLE_FIELDS). Settings: rc_paper_pieces_per_stack/per_stack/min and rc_substrate_* (substrate default 1 pc/stack). Backend: PaperCalcIn.round_corners + paper_quote round_corner_cost/retail/wholesale; DirectPrintCalcIn.round_corners + calc_directprint. UI: switch roundcorners-switch (Paper), dp-round-corners (Direct Print); "· Round Corners" line in PricingPanel.
- **Rush Pricing**: display-only panel in the shared PricingPanel (Metric.js) → appears in ALL modules after Generate Quote. Rows Standard / Next day (+rush_next_day_pct) / Same day (+rush_same_day_pct) for Retail and Wholesale, each on its own total (Option A). Percentages editable in Settings; rates fetched from /api/settings and cached (cache invalidated on Settings save via resetRushRatesCache).
- **Tax-Included view** (all modules): shared PricingPanel adds a "Tax Included" block with GST/PST broken out separately — Retail = Subtotal + GST% + PST%, Wholesale = Subtotal + GST% only (PST shown as —). Rates from settings.gst_pct/pst_pct.
- **Selectable Rush turnaround**: Rush Options rows are tappable; selecting Standard/Next day/Same day recalculates BOTH the Order Total and the Tax Included block on the chosen rushed price (retail & wholesale × factor). Selected row highlighted; header shows the active turnaround. Display-only (default Standard).
- **Volume Pricing +tax columns**: both the inline Paper Printing volume table AND the shared VolumePricingTable now add "Retail +tax" (GST+PST) and "WS +tax" (GST only) columns using settings.gst_pct/pst_pct (via exported useRushRates hook from Metric.js).
- **Unified Order Total box**: merged the pre-tax "Order Total" band and the "Tax Included" block into ONE box. Rush selector on top; two-column (Retail | Wholesale) breakdown Subtotal/GST/PST; the highlighted blue footer row "Total incl. tax" shows the tax-inclusive Retail (large) + Wholesale. Recalculates on Rush selection. data-testid order-total; tax-retail/tax-wholesale on the blue total.
- Verified E2E iteration_34: 8/8 backend pytest + frontend across Paper, Direct Print, Stickers, and Settings persistence. Tests: /app/backend/tests/test_round_corners_and_rush.py.


## Implemented (2026-06) — v41 Laminate/Foil: per-sheet price override + paper-style display + 2-roll parallel depletion
- **Paper-style display** in Materials table & form for laminate/hot_foil (reference 12×18 sheet): Unit Cost = $/linear ft, Finish Cost = cost 1 side, Printed 1 side / Printed 2 sides = cost @1/@2 sides, Retail/Wholesale = @2 sides. compute_material sets lam_per_ft, lam_ref_cost_1/2, lam_ref_retail_1/2, lam_ref_wholesale_1/2, finish_cost, selling_price, wholesale_price. Cost fields scrubbed for non-admin. Inventory value uses lam_roll_cost × rolls.
- **Per-sheet price override** (fields lam_retail_per_sheet, lam_wholesale_per_sheet — defined @12×18, 2 sides). Internally per_ft_override = override/3.0 (1.5ft × 2 sides); paper_quote _addon_sell uses override × sheet_len_ft × sides (scales by real size/sides), else markup on cost. Form shows override inputs + markup % + a Reference card (Cost/Retail/Wholesale × 1/2 sides). Motor por pie lineal intacto.
- **2-roll parallel depletion** (user clarification): 2-sided runs 2 rolls (top+bottom), each depleting the sheet length ONCE. _paper_addon_usage stores lam_ft_per_order = per-roll feet (sheets×sheet_len, NOT ×sides) + lam_sides/foil_sides. deduct_inventory_for_order: cycles = int(per_roll_used // roll_len); rolls_consumed = cycles × sides. Accumulator keyed by (material, sides) to avoid over-depletion on mixed-sides orders. Cost still ×sides (total material across both rolls).
- Verified E2E iteration_33: 19/19 backend pytest (matched-set roll consumption for sides 1/2, multi-cycle, partial carry-forward; override pricing 1-side=½ 2-side in override & markup modes; non-admin scrubbing). Tests: /app/backend/tests/test_laminate_v33.py.


## Implemented (2026-06) — v40 Laminate/Foil inventory tracked by ROLLS (smart per-roll deduction)
- User change: inventory for Laminate/Hot Foil now tracked & displayed by **rolls** (`stock_qty`), NOT linear feet. Materials table shows roll count "N rl" with `-`/`+` adjust buttons (same as other materials); the old "ft / rp ft" display and the duplicate generic Inventory block in the form are removed for laminate/foil.
- Form fields: "Stock (rolls)" → binds `stock_qty`, "Reorder point (rolls)" → binds `reorder_point`. Roll width/length(ft)/cost + foil color kept. Cost per linear ft still = lam_roll_cost / lam_length_ft (pricing unchanged).
- **Smart per-roll deduction (option B)** on order creation: new field `lam_open_used_ft` accumulates linear feet consumed on the currently-open roll; `stock_qty` decrements by `int(used // lam_length_ft)` rolls only when a full roll is consumed, remainder carried in `lam_open_used_ft`. Logic in `deduct_inventory_for_order` (server.py ~2769).
- Verified E2E iteration_32: backend 10/10 pytest (roll persistence, +/- adjust clamp at 0, accumulator math incl. multi-roll & carry-forward) + frontend create/display/adjust. Tests at /app/backend/tests/test_laminate_roll_deduction.py.

## Implemented (2026-06) — v39 Laminate & Hot Foil cost breakdown (separate lines)
- paper_quote now returns per-row lamination_cost/foil_cost (raw) + lamination_retail/foil_retail + lamination_wholesale/foil_wholesale (retail/wholesale marked-up; added to DISCOUNTABLE_FIELDS so volume discount applies consistently).
- UI shows them separately in BOTH the price card (PricingPanel: "· Lamination" / "· Hot Foil" at selling price + per-pc) and the Profitability panel (cost lines, admin). Per-unit computed frontend by /qty. Role-scrubbed (client no cost/wholesale, reseller no retail).

## Implemented (2026-06) — v38 Foil sides selector + default 2 sides
- Hot Foil now has the SAME 1/2-sides selector as Laminate (backend foil_sides in PaperCalcIn + foil_spec + addon-usage). Default for BOTH laminate and foil = **2 sides**. Verified laminate 2 sides = 2× (Velvete 1000pc: 1-side $41.25, 2-side $82.50).

## Implemented (2026-06) — v37 Laminate/Foil linear-ft inventory + auto-deduct on order
- Laminate/Foil materials track **stock in linear feet** (`lam_stock_ft`) + **reorder point** (`lam_reorder_ft`). Materials list shows ft stock and a red **"Reorder"** badge when stock ≤ reorder point.
- **Auto-deduction on order** (user chose: deduct only when a job becomes an order, NOT on quotes): paper quote saves laminate_id/sides + foil_id in inputs; `quote_to_product` computes `lam_ft_per_order`/`foil_ft_per_order` via grid_layout (sheets × sheet-length-ft × sides); `deduct_inventory_for_order` subtracts `ft × order_qty` from `lam_stock_ft`. Recorded in order.inventory_deductions (unit "linear ft").
- Verified E2E: Velvete 500ft, quote 1000pc/12x18/1-side (50 sheets → 75ft) → order qty1 → deducted 75ft → 425ft remaining.

## Implemented (2026-06) — v36 Paper Laminate & Hot Foil (roll materials)
- Materials → Paper now has a **Type** select: Normal (default) | Laminate | Hot Foil. For Laminate/Foil the form captures roll specs (width in, length ft, roll cost) + Color (foil); Unit dropdown hidden. Fields on Material: paper_type, lam_width_in, lam_length_ft, lam_roll_cost, foil_color.
- Paper Printing: Lamination switch → dropdown of registered laminates (assigned to paper) + 1/2 sides selector; new Hot Foil switch → dropdown of foils (shows color). New endpoint GET /api/paper-addons?type=laminate|hot_foil (no cost leaked).
- Pricing: laminate/foil cost per sheet = (roll_cost ÷ roll_length_ft) × (sheet length ft) × sides; added to the printing bucket and marked up like click. 2 sides = ×2 (covers the "one roll per side" Gloss case). Fallback to settings.lamination_per_sheet when laminate on with no material selected.
- Verified via API: Velvete ($275/500ft) on 12x18, 1000pc(50 sheets): lam 1-side $41.25, 2-side $82.50. Only Paper Printing consumes these for now; assignable to other modules via existing flags.

## Implemented (2026-06) — v35 Alphabetical + default extended to Sublimation & Garments
- Sublimation products and DTF/Embroidery garments now support a single `is_default` (Default switch + badge column). Sublimation calculator pre-selects the default product; DTF & Embroidery pre-select the default garment. All catalogs already sort alphabetically (register_crud).
- Backend: `is_default` added to Garment and SublimationProduct models; single-default enforcement is generic in register_crud.

## Implemented (2026-06) — v34 Paper Printing products: alphabetical + default
- GET on all register_crud lists now sorts alphabetically by name (when present). Paper Printing product dropdown + Products tab are alphabetical.
- Product model gained `is_default`; create/update enforce a SINGLE default (unset others). Products tab has a "Default" switch + "Default" badge column. Quote setup pre-selects the default product (falls back to first alphabetically). Verified via API: alpha order Business Card→Flyer→Postcard; setting one default leaves exactly one.

## Implemented (2026-06) — v33 Per-module volume discounts (editable qty + %)
- Volume discounts are now **per module** via `Settings.volume_discounts_by_module` {module: [{qty,pct}]}. A module with no tiers falls back to `default`. Editable in Settings → Volume Discounts with a module selector (vd-module-select) + "Copy Default tiers" helper. Applies to Retail & Wholesale.
- Backend: each /api/calc/* handler calls set_calc_module('<module>'); scrub() reads the module via a **contextvars.ContextVar** (`_CURRENT_MODULE_CV`) — fixes the concurrency tier-bleed risk flagged in iteration 30/31 (no global mutation). Module keys: paper, booklet, large-format, stickers, dtf, embroidery, laser, direct-print, channel-letters, sublimation, roll-stickers.
- Verified iteration_31 (13/13 new + regression 100%) + post-fix API check: DTF custom tiers (1/6/12/24/50/100) yield 6/10/22% while Paper stays on Default (100→5%). Legacy flat `volume_discounts` field kept for back-compat (unused by engine).
- Known/deferred (from testing agent): server.py >3200 lines needs router split; GET /api/materials ignores ?category filter.

## Implemented (2026-06) — v32 Volume Pricing mini-table in scalar-qty modules
- Reusable `components/VolumePricingTable.js`: recomputes a module's quote at each STANDARD_QTY (25→5000) and shows Qty · Discount · Retail/unit · Retail total (+ WS for admin/reseller), role-aware.
- Wired into Paper Printing (row-based, tap to focus) + Stickers, DTF, Embroidery, Sublimation, Roll Stickers (single-scalar quantity; refetches on input change via signature).
- NOTE: Large Format / Laser / Direct Print / Channel Letters use multi-size inputs (no single scalar qty) so the per-qty table does not map — deferred.

## Implemented (2026-06) — v31 Volume discounts (buy more → cheaper), all modules
- **Editable volume-discount tiers** in Settings ("Volume Discounts" card): each tier = {qty threshold, discount %}. Both quantity AND % are editable; add/remove tiers. Default: 25=0, 50=2, 100=5, 250=9, 500=13, 1000=18, 2500=23, 5000=28.
- **Applied centrally in scrub()** (all roles incl. admin, idempotent) to every priced quantity container across ALL 11 estimating modules — reduces Retail AND Wholesale totals + per-unit by the tier % (highest tier whose qty threshold ≤ order qty). Each result carries volume_discount_pct.
- Settings.volume_discounts field (default_factory), get_settings() refreshes module global _VOLUME_DISCOUNTS; discount_for_qty() helper; DISCOUNTABLE_FIELDS set. Paper Printing shows a "Volume discount · X% off @ N pc" note.
- Verified iteration_30 = backend 14/14 + frontend 100%. Paper unit price now decreases gradually 25→5000; RBAC intact; base pricing regression OK (100lb Cover @25 4/0 12x18 = $55.12).

## Implemented (2026-06) — v30 Paper Stocks pricing view + material-priced quotes
- **Paper Printing → Paper Stocks tab** is now a rich read-only table mirroring the Materials overview: Unit cost, Finish cost, Printed 1 side, Printed 2 sides, Retail, Wholesale, Stock (prices honor overrides; DEFAULT badge). Reads from central /materials (admin tab). Removed old CrudManager stock view.
- **Materials overview**: added Printed 1 side / Printed 2 sides columns (paper = finish + click / finish + 2×click; other categories show "—").
- **Paper quote pricing changed (user-approved)**: the paper's per-sheet price now uses its OWN Retail/Wholesale (markup or manual override), NOT raw-cost×markup. Printing (click 4/0·4/4) + lamination are marked up on top. Formula: RETAIL = sheets×paper_retail + markup(click+lam, retail%); WHOLESALE = sheets×paper_wholesale + markup(click+lam, ws%). Override is per-sheet. Verified: 100lb Cover ($4.00 retail/$2.50 ws override), 100pc 4/4, 12x18 (2-up, 50 sheets) → Retail $224.00, Wholesale $141.00, base cost $33.00.
- Backend: paper_quote reworked; calc_paper enriches each stock with retail_per_sheet/wholesale_per_sheet via compute_material (dropped before return to avoid role leakage).

## Implemented (2026-06) — v29 Miscellaneous material category + default-material sheet size
- **New "Miscellaneous" material category** in /materials (Unit=Each): fields Quantity (pieces) + Total price; auto `unit_cost = total_price / qty`, `stock = qty`. Backend Material gained `misc_qty`, `misc_price`. Verified example: 2Inch Silver Carbon Steel Buckle Hangers (Amazon Ca, B0DRN7B32R) → unit_cost $0.1399/ea (11.19/80), stock 80.
- **Sheet Size defaults to the module's DEFAULT material size** across all sheet-size modules (Paper Printing, Direct Print, Channel Letters) via shared hook `lib/useDefaultSheetSize.js`. Skips on Re-quote. Backend `map_material` now includes `size` in every per-module view. Set 100lb uncoated Cover size=12x18 (was empty) in PREVIEW db.
- NOTE (data is per-environment): to reflect in PRODUCTION, redeploy AND ensure each module's default material has a Size set in the production Materials page.

## Explained + implemented (2026-06) — v28 Retail/Wholesale visibility + overrides
- Retail = finish_cost × (1 + retail_markup%, default 200 → ×3); Wholesale = finish_cost × (1 + wholesale_markup%, default 100 → ×2). Markups editable in Settings > Markups (apply system-wide: materials, products, quotes). NO calc change per user request.
- Materials table now shows **both Retail and Wholesale** columns. Material form shows a **live pricing preview** (Finish cost / Retail / Wholesale) + 4 inputs: Retail override, Wholesale override (separate), Retail markup %, Wholesale markup % (labels show the ×multiplier). Added Material.wholesale_price_override; compute_material honors it. Verified iteration_28 (backend 5/5 + frontend 100%).

- **Profit margin per product** in Product Catalog: each BoM product row shows `cost · margin ($ and %)` (green positive / red negative), a red "BELOW COST" badge + tinted row when price < material cost, and a "Below cost" KPI. Products without a BoM show "manual price". Verified iteration_21 = frontend 100%.

### P2b remaining: PayPal at checkout (needs user's PayPal Client ID + Secret).

## Implemented (2026-06) — v22.1 Payment confirmation email
- On payment success (`_mark_paid`, triggered by both the Stripe webhook and the status-polling endpoint), the order transitions to paid ONCE and a branded **payment confirmation email** is sent to the customer via Resend (reuses existing EMERGENT_EMAIL_KEY integration). Email lists line items + total paid. Verified: Resend returned 202 Accepted.

- **Multi-module quote (cart)**: SaveQuoteBar gained an **"Add to quote"** button in every calculator → adds item to a localStorage cart (one cart). Sidebar **Quote Builder** nav shows a live cart badge. QuoteBuilder page (/quote-builder): editable qty, combined total, Save (multi quote: quote_type='multi', items[]) / Print. Multi quotes render an items table in the email HTML.
- **Quote→Product**: admin-only "Convert to product" on My Quotes → dialog (name, editable category w/ suggestions, price prefilled, publish toggle) → POST /api/quotes/{id}/to-product (carries module + specs snapshot).
- **Product Catalog** (/products-catalog, admin nav "Products"): products grouped by **category (A-Z within)**, publish toggle, full CRUD. Categories = predefined editable list (PRODUCT_CATEGORIES via /api/config, datalist input). Non-admin GET /catalog-products returns only published (ready for P2 storefront).
- Backend: CatalogProduct model + /api/catalog-products CRUD; QuoteIn extended (quote_type, items). CartContext provider wraps App.
- Verified iteration_16 = 6/6 backend + 100% frontend + RBAC. (Testing agent re-added 2 missing App.js imports that had been dropped during edits — now present, compiles clean.)


- Each per-module material (paper_stocks, roll_materials, sheet_materials, laser_materials, roll_sticker_materials) has an optional **linked_material_id**. When linked to a unified Material, its cost field (cost_per_sheet / price_per_sqft / roll_cost) is **overridden on read** by that material's live unit_cost — kept current by PDF purchase imports. Unlinked = works exactly as before (non-breaking).
- Backend: `LINK_COST_FIELD` map + `apply_links()` helper (DRY), applied in register_crud list + all calc endpoints (paper, booklet, largeformat, stickers, laser, directprint, channel, rollstickers). Cost now flows from purchases → materials → module quotes.
- Frontend: `CrudManager` gained a **material-link** field type (dropdown of unified materials w/ unit cost + "Not linked"); added to all 5 module material CRUDs + a "Linked" column.
- Verified iteration_15 = backend override/unlink/calc/regression + frontend link UI in all 5 modules. Fixed post-test bug: RollStickerMaterial model was missing linked_material_id (re-added + curl-verified).


- NEW admin-only **Profit & Loss** page (/profit-dashboard, nav "Profit & Loss"): monthly **quoted revenue** (from quotes) vs **purchases** (pre-tax = subtotal+shipping) vs **fixed monthly overhead** (fixed costs + machines) → **net profit**.
- KPIs (revenue, purchases, overhead, net profit red/green) + recharts **ComposedChart** (bars: quoted revenue & total cost; line: net profit) + monthly table. Range selector 6/12 months. Endpoint GET /api/finance/profit-dashboard?months=N (require_admin).
- NOTE: "revenue" = QUOTED this month (estimates), not confirmed sales — confirmed sales arrive with the e-commerce/orders phase (P2). Verified iteration_14 = 100% backend + frontend, admin-gated.
- **v18.1 Break-even line**: profit-dashboard now returns break_even_revenue (= monthly_overhead / gross_margin) + gross_margin_pct. Chart shows a red dashed **Break-even reference line** and a header note "X more to quote this month" (or "covered ✓"). Verified: break-even $36,956.91 @66.7% margin, no console errors.


- NEW admin-only **Profitability panel** rendered by the shared PricingPanel (Metric.js) → appears in ALL 11 calculators AND the quote-detail dialog, WITHOUT changing any quoted price (visibility-only, per user choice).
- Shows: Base production cost + **Labor** (editable, auto-estimated **Production time (h)** × **shop rate**) = **True manufacturing cost**, vs the quoted retail price → **Margin ($ and %)** with a red **Loss / below-cost alert** when negative.
- **Shop rate = business overhead hourly ($101.20 = $19,025/mo ÷ 188h) + optional selected machine hourly** (depreciation/lease + maintenance ÷ hours). Machine picker in the panel; defaults to "Shop rate only".
- Production time auto-estimated (area/40 or qty/1000 heuristic, min 0.25h) and editable. Debounced 300ms recompute via POST /api/calc/profitability (require_admin, RBAC verified). Component: ProfitabilityPanel.js.
- Verified iteration_13 = 5/5 backend + 100% frontend (Stickers, Paper, reseller-hidden, below-cost alert, no regression).
- **P0 Paso 2 (pending, own phase)**: connect the 11 modules' material sources to the unified Materials DB so material cost/inventory flow from purchases.
- **Approved next after P0**: Profitability Dashboard (quote revenue vs purchases/overhead → net profit per month).


- **Import supplier invoice from PDF**: admin uploads a supplier invoice/PO PDF → backend extracts text (pypdfium2) and parses it with **GPT-4o** (emergentintegrations, EMERGENT_LLM_KEY) into structured JSON (supplier, invoice #, date, line items [code/desc/qty/unit/unit_price/total], subtotal/GST/PST/shipping/total). Shows an **editable preview** before saving. Endpoint POST /api/purchases/parse (multipart, no save).
- **On confirm** (POST /api/purchases): saves a Purchase record (tax history) AND upserts Materials/Inventory when update_inventory=on — match by code (case-insensitive): if found, update unit_cost + **add** qty to stock + union modules; if not found, **create** the material. Supplier→module rule preselected & editable: Alfa→paper, Spicers/Grimco→large-format+direct-print (also sets a default category).
- **Purchase History** page (/purchases, admin): metrics (total spend, GST paid, PST paid), supplier + date-range filters, per-row delete, and **CSV export** (GET /api/purchases/export.csv) for taxes.
- Verified against the user's 3 real invoices (Alfa Paper, Spicers, Grimco) — parse + create/update + list + CSV all correct. iteration_12 = 8/8 backend + 100% frontend.
- NOTE: quantities stored as-is (e.g. Alfa "M Sheets" = thousands, not expanded). EMERGENT_LLM_KEY added to backend/.env.
- **v16.1 Tax dashboard**: GET /api/purchases/summary returns quarterly GST/PST/subtotal/total breakdown + spend grouped by supplier (respects supplier/date filters). Purchases page now shows a **Quarterly tax summary** table (BC GST/PST, ready for filing) + a **Spend by supplier** horizontal bar chart (recharts). Verified aggregation by curl.


- **Ink consumption applies per brand+technology**: calibrating one machine's ml/ft² now auto-propagates to all sibling machines of the same brand + category (e.g. all Roland eco-solvent large-format, or all Roland UV directprint, or all Mimaki). Endpoints /api/ink/calibrate and /api/ink/calibrate-file return `siblings_updated`; InkEstimator toast reports how many siblings were updated.
- **Unified Materials DB** (new `materials` collection, NOT the per-module tables): nickname/name, code, category, full supplier info (company/contact/phone/email), unit + specs (size/gramage/weight/sheet_area_sqft), unit_cost, labor_minutes, machine_id + ink_coverage_pct. Computed on read: **finish_cost** (unit cost + labor via business+machine hourly + ink cost), retail/wholesale price, price_override with **below-cost warning**, cross-module usage flags, and **DEFAULT material** per category (auto-unsets others).
- **Inventory**: stock_qty + reorder_point + reorder_target per material; low-stock badge (red) + inline +/- stock adjust (POST /api/materials/{id}/adjust-stock, never below 0).
- **Reorder Center** (/reorder): low-stock materials grouped by supplier with auto-suggested qty (target − current, editable) + 1-click editable reorder email via Resend (POST /api/materials/reorder/email).
- Role scrubbing: non-admin GET /api/materials hides cost/supplier/stock fields; all writes + reorder are admin-only. 4 demo materials seeded (guarded by migration).
- Pages: Materials.js, ReorderCenter.js; nav + routes added (adminOnly). Verified iteration_11 = 9/9 backend + 100% frontend flows.

### Phase 2 remaining (next — P0)
- Integrate exact manufacturing cost (shop rate + material finish cost + ink) into ALL 11 quoting modules' outputs (link quote material inputs to the unified Materials DB where relevant).


- Ink Estimator "Calibrate" now uses the exact data VersaWorks shows: enter **Print Area (W×H in)** + **Ink Consumption (ml)** and attach the same file → the system measures the file's coverage automatically and back-solves the machine's ml/ft² @100% (running average across jobs). Endpoint POST /api/ink/calibrate-file (multipart). Manual coverage still available as fallback.
- Verified with the user's real VP-540i reading (48.8×11.8 in = 4.0 ft², 2.35 ml, solid file → 87.9% coverage → 0.669 ml/ft²; a 48×96 banner @100% then estimates 21.41 ml / $5.35 — realistic eco-solvent). Confirms default 10 ml/ft² must be calibrated per machine (eco-solvent ≪ UV).
- NEXT: Phase 2 core — Materials overhaul + Inventory + Reorder Center (still pending).

## Implemented (2026-07-19) — v13 Ink in quoting + PDF
- Large Format & Direct Print calculators now have an admin-only "Machine & Ink" picker (InkPicker): choose which machine fabricates the job + coverage % → ink cost is added into base before markup, so it flows into Retail/Wholesale/unit prices. Machine+coverage saved in quote inputs (survives Re-quote). LF shows an explicit ink line; DP shows an "Ink (machine)" cost row. Verified: LF Mimaki@50% +$40 (retail 158.40→278.40); DP LEJ-640FT@100% +$30 (retail 232.80).
- Backend /calc/largeformat & /calc/directprint accept machine_id + ink_coverage_pct.
- Ink Estimator now accepts **PDF** (pypdfium2 renders page 1 → CMYK density). Verified full-color PDF → 100% coverage. requirements.txt updated (pypdfium2).
- Verified: iteration_10 frontend 100% + non-admin gating (picker hidden for reseller).

## Implemented (2026-07-19) — v12 Business Control · Phase 2a (Ink Estimator)
- NEW admin **Ink / Toner Estimator** (/ink-estimator): 3-layer ink cost strategy.
  1. Coverage-based estimate (25/50/75/100% buttons + slider) — works with no file.
  2. **File analysis**: upload artwork → server converts to CMYK (Pillow) and computes average ink density → auto coverage % (verified: mostly-white "Big Sale" ≈16.6%, full-color ≈100%).
  3. **Self-calibration**: enter real VersaWorks total ml + area/coverage → machine's ml/ft² recomputed as running weighted average (learns from real jobs). Endpoint POST /api/ink/calibrate.
- Machine model gained ink_ml_per_sqft_full (calibratable), ink_cost_per_ml, ink_full_ref_density; editable in Machinery CRUD. Endpoint POST /api/ink/estimate (multipart, coverage or file).
- Verified: iteration_9 frontend 100% + backend via curl. Minor a11y warning (CrudManager dialog) deferred.

### Phase 2 remaining (next)
- Materials overhaul: nickname + full supplier info (company, contact, phone, email, weight, gramage, size), auto Unit cost & **Finish cost** (printed sheet incl. machine+ink+labor using shop rate + ink estimator), **price override**, **below-cost warning**, cross-module usage flags, **DEFAULT material**.
- **Inventory** per material + reorder point + alerts; **Reorder Center** grouped by supplier with 1-click editable reorder email (Resend). Applies to all material/supply areas.
- Sales analytics (sold per hour/day/week/month, best-sellers, units-to-sell to cover costs) — depends on Orders (Phase 4); break-even $ already live in Financials.

## Implemented (2026-07-19) — v11 Business Control · Phase 1
- NEW admin-only "Business" area: **Machinery/Assets DB**, **Fixed Costs**, **Financial Control dashboard**.
- Machine model: owned (straight-line depreciation over useful life) or leased (lease + 2%/yr maintenance) → computed monthly_cost & hourly_cost (monthly ÷ productive hours, per-machine or shop default 188 h/mo). Seeded 12 real machines.
- Fixed Costs (rent, payroll, utilities, misc) seeded to $19,025/mo overhead. Business hourly rate = overhead ÷ 188 = $101.20.
- /finance/summary: overhead $19,025, machines $5,612.94, total monthly nut $24,637.94, break-even revenue $36,956.91 (@66.7% gross margin from retail markup), equipment investment $184,500, GST 5% + PST 7% (BC). Break-even progress bar vs quoted-this-month.
- Endpoints require_admin; routes gated via <Protected adminOnly>. Verified iteration_8 = 100% backend+frontend + reseller gating (403 / redirect).
- Assumptions locked: BC taxes 5/7, payroll 4.33 wk/mo ($11,700), combination cost model (shop hourly + per-machine), maintenance default 2%/yr, base hours = 188 open h/mo. LEJ-640 purchase price pending (seeded 0).

### Remaining Business-Control roadmap (P0 → down)
- Phase 2: True manufacturing cost integrated into calculators + Materials overhaul (nickname + supplier info, inventory + reorder alerts, reorder center with 1-click supplier email, cross-module usage, DEFAULT material, auto unit/finish cost, price override, below-cost warning).
- Phase 3: Multi-module quotes + per-line Quote→Product conversion + Products catalog (A–Z, categories).
- Phase 4: Client/Reseller e-commerce storefront (browse/buy/orders/invoice/history) + inventory & material deduction on purchase.
- Phase 5: Business valuation / projections / franchise readiness.

## Implemented (2026-07-19) — v10 Email from detail dialog
- Added a "Email" button inside the quote-detail dialog (Catalog + My Quotes) with an inline recipient field, reusing POST /quotes/{id}/email (Resend). Verified end-to-end: 200 + "Quote emailed" (sent to admin during test). Lets you send/re-send a branded quote right after viewing or Re-quoting.

## Implemented (2026-07-19) — v9 Backfill + Catalog search
- Startup migration `backfill_quote_inputs()` reconstructs `inputs` from the saved summary for legacy quotes that predate v8, so Re-quote pre-fills them too. Reliable only for modules whose summary fully captures the config (Paper, Stickers, Sublimation, Roll Stickers); other modules (Booklet/Large Format/Laser/Direct Print/Channel/DTF/Embroidery) never stored sizes/placements in the summary, so those legacy quotes just navigate (no misleading auto-calc). Verified: 3/8 existing quotes backfilled.
- Price Catalog search now matches BOTH product title and customer name.

## Implemented (2026-07-19) — v8 Re-quote Pre-fill + Auto-recalculate
- "Re-quote" now PRE-FILLS the destination calculator with the saved configuration and AUTO-RECALCULATES instantly with current prices, across all 11 modules.
- Each saved quote now persists its raw `inputs` (SaveQuoteBar posts `inputs`; backend QuoteIn stores/returns it). QuoteDetailDialog passes `inputs` via router navigation state; new shared hook `lib/useRequote.js` applies them on mount then runs calc() once.
- Verified: iteration_7 = 100% (4/4 flows: Stickers, Booklet, Large Format multi-size, and Re-quote from My Quotes) — fields pre-filled + results auto-computed with full PricingPanel. NOTE: only quotes saved AFTER this change carry inputs; older quotes just navigate to the module.

## Implemented (2026-07-19) — v7 Full Price Breakdown + Re-quote
- Every module + saved quote now exposes the COMPLETE price breakdown for admin: Production Cost (base_cost), Retail Price (+ per-piece unit), Wholesale Price (+ per-piece unit), and Order Total. New shared `PricingPanel` (components/Metric.js) renders these consistently across all 11 calculators, plus the Catalog/Quotes detail dialog. Role scrubbing preserved (client=retail only, reseller=wholesale only, admin=all incl. cost).
- Backend calc endpoints normalized to always return base_cost, retail_total, wholesale_total, unit_price, wholesale_unit (added missing unit fields to Laser/Direct Print/Large Format and base/units to Booklet/Stickers; per-row base_cost_4_0/4_4 to Paper).
- Added "Re-quote" button in QuoteDetailDialog (navigates to the source module). Consolidated duplicate priceOf into Metric.js.
- Verified: iteration_6 = 11/11 calculators + Quotes dialog show all 4 price rows; Re-quote navigation works. NOTE: quotes SAVED BEFORE this update only carry the fields that were stored then, so their catalog detail may show fewer rows — new quotes store the full breakdown (confirmed via API save→read).

## Implemented (2026-07-19) — v6 Modern UI
- MODERNIZED UI across ALL 11 calculator modules (user: "esta mejora la quiero en todo"): metric cards row, pill/segmented toggles, sheet-layout nesting previews (where applicable), and selectable comparison cards with "Best Value" badge. Multi-material modules (Paper, Stickers, Large Format, Laser, Direct Print, Channel Letters) now let you click a compare card to switch the highlighted material. Rounded-xl cards + PageHeader `eyebrow`.
- Shared UI primitives: `components/Metric.js` (Metric, ConfigCard, EmptyState, SectionLabel, priceOf).
- CATALOG + QUOTES CLICK-THROUGH: new `components/QuoteDetailDialog.js` — clicking any row in Price Catalog or My Quotes opens a full detail modal (Specifications, Cost & Pricing breakdown, nesting layout, notes). Email/Delete buttons in Quotes stopPropagation so they don't open the detail dialog.
- Backend unchanged. Verified: frontend testing agent iteration_5 = 100% (11/11 calculators + save-quote + both detail dialogs + stopPropagation).

## Original Problem Statement (v2 additions)
Roles (admin/client-retail/reseller-wholesale) + modules DTF, Embroidery, Laser, Direct Print (Coroplast/ACM/PVC UV CMYKWW on 4x8 & 5x10 sheets + CNC), Channel Letters (6"–48", auto from sheet sizes).
