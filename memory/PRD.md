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
