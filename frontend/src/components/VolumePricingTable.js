import { useEffect, useState } from "react";
import api from "@/lib/api";
import { money } from "@/lib/format";

const QTYS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

// Recomputes the module's quote at each standard quantity to show volume savings.
// Props: endpoint, makeBody(qty)->body, extract(data)->priced dict, signature (refetch key), unitLabel.
export default function VolumePricingTable({ endpoint, makeBody, extract, signature, unitLabel = "unit", className = "" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      QTYS.map((q) =>
        api.post(endpoint, makeBody(q)).then((r) => ({ q, d: extract(r.data) })).catch(() => ({ q, d: null }))
      )
    ).then((out) => {
      if (!alive) return;
      setRows(out.map(({ q, d }) => ({
        qty: q,
        retail_total: d?.retail_total ?? d?.selling_price ?? d?.customer_price ?? null,
        retail_unit: d?.unit_price ?? null,
        wholesale_total: d?.wholesale_total ?? d?.wholesale_price ?? null,
        wholesale_unit: d?.wholesale_unit ?? null,
        disc: d?.volume_discount_pct ?? 0,
      })));
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [signature]);

  const hasRetail = rows.some((r) => r.retail_total != null);
  const hasWs = rows.some((r) => r.wholesale_total != null);

  return (
    <div className={className} data-testid="volume-pricing-table">
      <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">Volume Pricing {loading ? "· …" : ""}</div>
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
              <th className="text-left px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Discount</th>
              {hasRetail && <th className="text-right px-4 py-2">Retail / {unitLabel}</th>}
              {hasRetail && <th className="text-right px-4 py-2">Retail total</th>}
              {hasWs && <th className="text-right px-4 py-2">WS / {unitLabel}</th>}
              {hasWs && <th className="text-right px-4 py-2">WS total</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.qty} data-testid="volume-row" className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 num font-semibold">{r.qty}</td>
                <td className="px-4 py-2 text-right num">{r.disc > 0 ? <span className="text-emerald-600">−{r.disc}%</span> : <span className="text-slate-300">—</span>}</td>
                {hasRetail && <td className="px-4 py-2 text-right num text-slate-600">{r.retail_unit != null ? money(r.retail_unit) : "—"}</td>}
                {hasRetail && <td className="px-4 py-2 text-right num font-semibold text-[#2495D3]">{r.retail_total != null ? money(r.retail_total) : "—"}</td>}
                {hasWs && <td className="px-4 py-2 text-right num text-slate-500">{r.wholesale_unit != null ? money(r.wholesale_unit) : "—"}</td>}
                {hasWs && <td className="px-4 py-2 text-right num text-slate-600">{r.wholesale_total != null ? money(r.wholesale_total) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Discounts are editable in Settings → Volume Discounts.</p>
    </div>
  );
}
