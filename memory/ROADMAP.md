# ROADMAP — Print Shop ERP

## Ideas parked / on hold (user asked to revisit later)
- **[ON HOLD] Profitability panel enhancements** (user: "por el momento no sé qué hacer, dejemos esto para después"). Panel already explained. Candidate improvements when revisited:
  - Target minimum margin % with a warning/badge when a quote falls below it.
  - Editable overhead ($/h) and machine hourly directly from the Profitability panel.
  - Suggest a "recommended retail price" to hit a chosen margin.

## Done (2026-06)
- **AI marketing generator (Claude Sonnet 4.6 via Emergent LLM key)**: "Generate with AI" button in the Convert-to-product dialog calls `POST /api/marketing/generate` and produces a bilingual (EN+ES) bundle stored on the product's `marketing` field: short + long description, feature bullets, SEO title/meta/slug/keywords, 10-14 hashtags, and ready-to-post Instagram / Facebook / Kijiji copy + image alt text. StoreProduct sets `document.title` + meta description from the SEO fields. Verified via curl (full JSON, 14 hashtags, ES copy) + screenshot (button → description filled + green "AI content ready" preview).
- **Related products ("You may also like")**: multi-select in the Convert dialog (stored in `config.related_ids`); shown as a card row on the StoreProduct page (links to each related product). Verified backend returns published related summaries.
- **Per-product turnaround / production times on configurable paper products**: Convert-to-product dialog now has a "Turnaround / production times" editor — activate/rename/set custom surcharge % per option, add extra options, and pick the Default. Prefilled from Settings rush % (Standard 0, Next day, Same day) but stored per-product with their own %. Surcharge applies to BOTH Retail & Wholesale (price already includes it — Grab-n-Go). Store shows a turnaround pill selector (or a fixed line if only one, e.g. "Turnaround time: 2 hour same day"). Orders re-price with the chosen turnaround server-side and label the line. Verified via curl (custom label/%, default, +15% price, order line) + screenshots (dialog editor, store fixed line $24.96).
- **Admin "View as" preview (Retail / Wholesale)**: sidebar footer toggle (admin only) sends `X-View-As` header; backend `eff_role()` + `scrub()` honor it (price scrubbing only, not authorization) so admin previews the whole app with client/reseller prices without a separate account. Amber banner + Exit while active. Verified via curl (reseller=wholesale w/ PST 0; client hides wholesale on /calc/paper) + screenshot.
- **Store tax breakdown**: `/store/paper-price` returns per-option subtotal/GST/PST/total-incl-tax; StoreProduct page + cart checkout show Subtotal · GST · PST · Total incl. tax (PST = — for wholesale). Role-scrubbed. Verified.
- **Configurable "Grab-n-Go" paper products (quote → sellable product)**: new admin **"Convert to product"** button in Paper Printing pricing bar opens a dialog (name, category, papers offered auto-by-class OR hand-picked, print sides, allowed add-ons lamination/foil/round-corners, publish). Creates a `configurable_paper` CatalogProduct storing the base piece + sheet + allowed papers + options.
  - **Client storefront**: dedicated product page `/store/product/:id` (own URL) — minimalist: quantity pills, One/Both sides, add-on switches, allowed papers side-by-side with **live role-based price incl. tax** (client=retail incl GST+PST, reseller=wholesale incl GST), sticky "Add to cart" bar, collapsible technical details. Reuses `/calc/paper` engine via `POST /api/store/paper-price`.
  - **Anti-duplicate alert**: `GET /api/products/paper-match?product_id=` — Paper Printing shows a banner when a configurable product already exists for the same base piece, so estimators reuse it instead of re-quoting.
  - Orders re-price configurable lines server-side (trusted). NOTE: automatic material/inventory deduction for configurable-paper orders is DEFERRED (static-BoM products still deduct). Store cart is a separate `StoreCartContext` (localStorage). Verified via curl (create/match/price by role/order) + screenshots (convert dialog, banner, store product page, add to cart).
- **In-memory quote persistence across ALL 11 estimating modules**: the generated quote + inputs are kept when navigating between modules (client-side), and reset on a browser refresh (F5). Implemented via `lib/calcCache.js` (module-level in-memory store) + extended `useRequote(applyAll, calc, { moduleKey, inputs, hasResult })`; `useDefaultSheetSize` skips when a cached quote exists. Laser gained a `useRequote` call (didn't have one). Verified via screenshots (switch module → quote stays; refresh → resets).
- Paper Printing **Product dropdown** now matches the Paper Products table: sorted by finished area ascending (11x17/12x18 at the bottom) and labeled with both dimensions in inch marks (e.g. `Business Card — 3.50" × 2.00"`). Verified via screenshot.

## P0 / P1 backlog
- Save chosen Rush turnaround + tax-inclusive price onto the quote/order when converting to an order/invoice.
- Show GST/PST breakdown + tax-included total on the client-facing PDF/quote.
- Sales Dashboard: break-even per day/week/month/year, best-seller ranking, real profit vs break-even.
- Product images via Object Storage in the Storefront.
- "Copy price for client" button (price + turnaround + taxes) for email/WhatsApp.

## Blocked
- PayPal checkout — waiting on user's Client ID + Secret.

## Tech debt
- Refactor server.py (>3400 lines) into routers.
- Phase 5: Business Valuation & Projections dashboard.
