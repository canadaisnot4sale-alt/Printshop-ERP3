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

## Next Tasks
- Await user feedback; likely add estimate saving + PDF export, and logo upload.
