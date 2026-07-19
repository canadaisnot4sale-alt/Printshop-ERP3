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
- P1: PDF quote as branded document (currently browser print); email quote.
- P2: True multi-job 2D nesting visualization; split cost UI for shared sections.
- P2: Brute-force login lockout; dark mode; split server.py into modules.

## Original Problem Statement (v2 additions)
Roles (admin/client-retail/reseller-wholesale) + modules DTF, Embroidery, Laser, Direct Print (Coroplast/ACM/PVC UV CMYKWW on 4x8 & 5x10 sheets + CNC), Channel Letters (6"–48", auto from sheet sizes).
