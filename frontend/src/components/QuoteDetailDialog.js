import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NestingCanvas from "@/components/NestingCanvas";
import { SectionLabel } from "@/components/Metric";
import { money } from "@/lib/format";

const MONEY_RE = /(cost|price|total|unit|charge|labor)/i;
const SKIP_RE = /(_id$|^id$|layout|placements|rows|qtys|results|role|markup|created_at|user_email|emailed)/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const humanize = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function flatten(obj, out, depth) {
  if (!obj || typeof obj !== "object" || depth > 2) return out;
  Object.entries(obj).forEach(([k, v]) => {
    if (SKIP_RE.test(k) || v == null || v === "") return;
    if (Array.isArray(v)) return;
    if (typeof v === "object") return flatten(v, out, depth + 1);
    if (typeof v === "string" && ISO_RE.test(v)) return;
    if (typeof v === "boolean") return out.push({ label: humanize(k), value: v ? "Yes" : "No" });
    const isMoney = MONEY_RE.test(k) && typeof v === "number";
    out.push({ label: humanize(k), value: isMoney ? money(v) : String(v), money: isMoney });
  });
  return out;
}

function findLayout(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  if (obj.layout && obj.layout.placements) return obj.layout;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const l = findLayout(v, depth + 1);
      if (l) return l;
    }
  }
  return null;
}

const priceOf = (s) =>
  s?.retail_total ?? s?.customer_price ?? s?.wholesale_total ?? s?.wholesale_price ??
  s?.results?.[0]?.retail_total ?? s?.total?.selling_price ?? s?.total?.wholesale_price ?? s?.selling_price;

export default function QuoteDetailDialog({ quote, open, onOpenChange }) {
  const rows = useMemo(() => (quote ? flatten(quote.summary, [], 0) : []), [quote]);
  const layout = useMemo(() => (quote ? findLayout(quote.summary) : null), [quote]);
  if (!quote) return null;
  const price = priceOf(quote.summary);
  const specs = rows.filter((r) => !r.money);
  const costs = rows.filter((r) => r.money);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="quote-detail-dialog">
        <DialogHeader>
          <DialogTitle className="font-head text-xl">{quote.title || "Quote"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono uppercase bg-[#2495D3]/10 text-[#2495D3] px-2 py-0.5 rounded-full">{quote.module}</span>
          {quote.customer_name && <span className="text-slate-500">· {quote.customer_name}</span>}
          {quote.created_at && <span className="text-slate-400 num">· {new Date(quote.created_at).toLocaleDateString()}</span>}
        </div>

        {price != null && (
          <div className="rounded-xl bg-[#2495D3] text-white p-5 mt-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/80">Quoted Price</div>
            <div className="num text-4xl font-black mt-1">{money(price)}</div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6 mt-2">
          {specs.length > 0 && (
            <div>
              <SectionLabel>Specifications</SectionLabel>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {specs.map((r, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{r.label}</span>
                    <span className="num text-slate-800">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {costs.length > 0 && (
            <div>
              <SectionLabel>Cost & Pricing</SectionLabel>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {costs.map((r, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{r.label}</span>
                    <span className="num tabular text-slate-800">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {layout && (
          <div className="mt-2">
            <SectionLabel>Sheet Layout</SectionLabel>
            <NestingCanvas layout={layout} />
          </div>
        )}

        {quote.notes && (
          <div className="mt-2">
            <SectionLabel>Notes</SectionLabel>
            <p className="text-sm text-slate-600">{quote.notes}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
