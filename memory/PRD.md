# Print and Save — Print Shop ERP & Estimating

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
