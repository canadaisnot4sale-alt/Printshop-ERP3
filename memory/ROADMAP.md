# ROADMAP — Print Shop ERP

## Ideas parked / on hold (user asked to revisit later)
- **[ON HOLD] Profitability panel enhancements** (user: "por el momento no sé qué hacer, dejemos esto para después"). Panel already explained. Candidate improvements when revisited:
  - Target minimum margin % with a warning/badge when a quote falls below it.
  - Editable overhead ($/h) and machine hourly directly from the Profitability panel.
  - Suggest a "recommended retail price" to hit a chosen margin.

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
