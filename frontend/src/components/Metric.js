// Shared modern UI primitives used across every module.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { money } from "@/lib/format";
import ProfitabilityPanel from "@/components/ProfitabilityPanel";

// Rush surcharge rates + tax rates fetched once and cached across the app.
let _rushCache = null;
export function resetRushRatesCache() { _rushCache = null; }
export function useRushRates() {
  const [r, setR] = useState(_rushCache);
  useEffect(() => {
    if (_rushCache) return;
    api.get("/settings").then(({ data }) => {
      _rushCache = {
        same: Number(data.rush_same_day_pct ?? 15), next: Number(data.rush_next_day_pct ?? 10),
        gst: Number(data.gst_pct ?? 5), pst: Number(data.pst_pct ?? 7),
      };
      setR(_rushCache);
    }).catch(() => {});
  }, []);
  return r || { same: 15, next: 10, gst: 5, pst: 7 };
}

export function Metric({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "bg-[#2495D3] border-[#2495D3] text-white" : "bg-white border-slate-200"}`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${accent ? "text-white/80" : "text-slate-500"}`}>
        {Icon && <Icon size={13} />} {label}
      </div>
      <div className={`num text-2xl font-black mt-1.5 ${accent ? "text-white" : "text-slate-900"}`}>{value}</div>
      {sub != null && sub !== "" && <div className={`text-[11px] num mt-0.5 ${accent ? "text-white/70" : "text-slate-400"}`}>{sub}</div>}
    </div>
  );
}

export function SectionLabel({ children, className = "" }) {
  return <div className={`text-xs font-mono uppercase tracking-widest text-slate-500 mb-2 ${className}`}>{children}</div>;
}

export function EmptyState({ children, testid }) {
  return <div data-testid={testid} className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400">{children}</div>;
}

export function ConfigCard({ title, children, className = "" }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-6 h-fit ${className}`}>
      {title && <h3 className="font-head font-bold mb-4">{title}</h3>}
      {children}
    </div>
  );
}

// Normalized selling price from any calc result shape (role-scrubbed server-side).
export const priceOf = (r) =>
  r?.retail_total ?? r?.customer_price ?? r?.selling_price ??
  r?.total?.selling_price ?? r?.wholesale_total ?? r?.wholesale_price ?? r?.total?.wholesale_price;

function PriceLine({ label, value, unit, tone = "default", testid }) {
  const color = tone === "muted" ? "text-slate-500" : tone === "retail" ? "text-[#2495D3]" : "text-slate-800";
  return (
    <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-slate-100">
      <span className="text-xs text-slate-500">
        {label}{unit != null && <span className="text-slate-400"> · {money(unit)}/pc</span>}
      </span>
      <span className={`num tabular font-semibold ${color}`} data-testid={testid}>{money(value)}</span>
    </div>
  );
}

// Full price breakdown: production cost, retail (+unit), wholesale (+unit), order total.
// Only renders the rows the server returned for the current role.
export function PricingPanel({ r, className = "" }) {
  const rush = useRushRates();
  const [rushSel, setRushSel] = useState(0);
  if (!r) return null;
  const prod = r.base_cost ?? r.total_cost;
  const retailBase = r.retail_total ?? r.customer_price ?? r.selling_price;
  const wholesaleBase = r.wholesale_total ?? r.wholesale_price;
  const rushOpts = [
    { label: "Standard", pct: 0 },
    { label: `Next day +${rush.next}%`, pct: rush.next },
    { label: `Same day +${rush.same}%`, pct: rush.same },
  ];
  const sel = rushOpts[rushSel] || rushOpts[0];
  const factor = 1 + sel.pct / 100;
  const retail = retailBase != null ? retailBase * factor : null;
  const wholesale = wholesaleBase != null ? wholesaleBase * factor : null;
  const order = retail ?? wholesale;
  return (
    <div className={className} data-testid="pricing-panel-wrap">
      <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="pricing-panel">
        {prod != null && <PriceLine label="Production Cost" value={prod} tone="muted" testid="price-production" />}
        {retailBase != null && <PriceLine label="Retail Price" value={retailBase} unit={r.unit_price} tone="retail" testid="price-retail" />}
        {wholesaleBase != null && <PriceLine label="Wholesale Price" value={wholesaleBase} unit={r.wholesale_unit} testid="price-wholesale" />}
        {(() => { const v = r.lamination_retail ?? r.lamination_wholesale; return v > 0 ? <PriceLine label="· Lamination" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-lamination" /> : null; })()}
        {(() => { const v = r.foil_retail ?? r.foil_wholesale; return v > 0 ? <PriceLine label="· Hot Foil" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-foil" /> : null; })()}
        {(() => { const v = r.round_corner_retail ?? r.round_corner_wholesale; return v > 0 ? <PriceLine label="· Round Corners" value={v} tone="muted" testid="price-roundcorner" /> : null; })()}
        {order != null && (
          <div className="flex items-baseline justify-between bg-[#2495D3] text-white px-4 py-3">
            <span className="text-[10px] font-mono uppercase tracking-widest">Order Total · {sel.label}</span>
            <span className="num text-2xl font-black" data-testid="price-order-total">{money(order)}</span>
          </div>
        )}
      </div>
      {order != null && (
        <div className="rounded-xl border border-slate-200 mt-2 overflow-hidden" data-testid="rush-pricing">
          <div className="bg-slate-50 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-200">Rush Options · tap to apply</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-1.5">Turnaround</th>
                {retailBase != null && <th className="text-right px-4 py-1.5">Retail</th>}
                {wholesaleBase != null && <th className="text-right px-4 py-1.5">Wholesale</th>}
              </tr>
            </thead>
            <tbody>
              {rushOpts.map((o, i) => (
                <tr key={i} onClick={() => setRushSel(i)} data-testid={`rush-opt-${i}`}
                  className={`cursor-pointer transition-colors ${rushSel === i ? "bg-[#2495D3]/10" : "hover:bg-slate-50"}`}>
                  <td className="px-4 py-1.5 text-slate-600">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${rushSel === i ? "bg-[#2495D3]" : "bg-slate-200"}`} />{o.label}
                  </td>
                  {retailBase != null && <td className={`px-4 py-1.5 text-right num ${rushSel === i ? "text-[#2495D3] font-semibold" : "text-slate-500"}`}>{money(retailBase * (1 + o.pct / 100))}</td>}
                  {wholesaleBase != null && <td className={`px-4 py-1.5 text-right num ${rushSel === i ? "font-semibold" : "text-slate-500"}`}>{money(wholesaleBase * (1 + o.pct / 100))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {order != null && (
        <div className="rounded-xl border border-slate-200 mt-2 overflow-hidden" data-testid="tax-pricing">
          <div className="bg-slate-50 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-200">Tax Included · {sel.label}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-1.5"></th>
                {retail != null && <th className="text-right px-4 py-1.5">Retail</th>}
                {wholesale != null && <th className="text-right px-4 py-1.5">Wholesale</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50">
                <td className="px-4 py-1.5 text-slate-500">Subtotal</td>
                {retail != null && <td className="px-4 py-1.5 text-right num" data-testid="tax-retail-subtotal">{money(retail)}</td>}
                {wholesale != null && <td className="px-4 py-1.5 text-right num" data-testid="tax-ws-subtotal">{money(wholesale)}</td>}
              </tr>
              <tr className="border-b border-slate-50">
                <td className="px-4 py-1.5 text-slate-500">GST {rush.gst}%</td>
                {retail != null && <td className="px-4 py-1.5 text-right num" data-testid="tax-retail-gst">{money(retail * rush.gst / 100)}</td>}
                {wholesale != null && <td className="px-4 py-1.5 text-right num" data-testid="tax-ws-gst">{money(wholesale * rush.gst / 100)}</td>}
              </tr>
              <tr className="border-b border-slate-50">
                <td className="px-4 py-1.5 text-slate-500">PST {rush.pst}%</td>
                {retail != null && <td className="px-4 py-1.5 text-right num" data-testid="tax-retail-pst">{money(retail * rush.pst / 100)}</td>}
                {wholesale != null && <td className="px-4 py-1.5 text-right num text-slate-300">—</td>}
              </tr>
              <tr>
                <td className="px-4 py-1.5 text-slate-600 font-semibold">Total w/ tax</td>
                {retail != null && <td className="px-4 py-1.5 text-right num text-[#2495D3] font-semibold" data-testid="tax-retail">{money(retail * (1 + (rush.gst + rush.pst) / 100))}</td>}
                {wholesale != null && <td className="px-4 py-1.5 text-right num text-slate-600 font-semibold" data-testid="tax-wholesale">{money(wholesale * (1 + rush.gst / 100))}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <ProfitabilityPanel r={r} />
    </div>
  );
}
