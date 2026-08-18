// Shared modern UI primitives used across every module.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { money } from "@/lib/format";
import ProfitabilityPanel from "@/components/ProfitabilityPanel";

// Rush surcharge rates (Same day / Next day) fetched once and cached across the app.
let _rushCache = null;
export function resetRushRatesCache() { _rushCache = null; }
function useRushRates() {
  const [r, setR] = useState(_rushCache);
  useEffect(() => {
    if (_rushCache) return;
    api.get("/settings").then(({ data }) => {
      _rushCache = { same: Number(data.rush_same_day_pct ?? 15), next: Number(data.rush_next_day_pct ?? 10) };
      setR(_rushCache);
    }).catch(() => {});
  }, []);
  return r || { same: 15, next: 10 };
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
  if (!r) return null;
  const prod = r.base_cost ?? r.total_cost;
  const retail = r.retail_total ?? r.customer_price ?? r.selling_price;
  const wholesale = r.wholesale_total ?? r.wholesale_price;
  const order = retail ?? wholesale;
  const rushRow = (label, pct) => (
    <tr>
      <td className="px-4 py-1.5 text-slate-500">{label}</td>
      {retail != null && <td className="px-4 py-1.5 text-right num text-[#2495D3]">{money(retail * (1 + pct / 100))}</td>}
      {wholesale != null && <td className="px-4 py-1.5 text-right num text-slate-600">{money(wholesale * (1 + pct / 100))}</td>}
    </tr>
  );
  return (
    <div className={className} data-testid="pricing-panel-wrap">
      <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="pricing-panel">
        {prod != null && <PriceLine label="Production Cost" value={prod} tone="muted" testid="price-production" />}
        {retail != null && <PriceLine label="Retail Price" value={retail} unit={r.unit_price} tone="retail" testid="price-retail" />}
        {wholesale != null && <PriceLine label="Wholesale Price" value={wholesale} unit={r.wholesale_unit} testid="price-wholesale" />}
        {(() => { const v = r.lamination_retail ?? r.lamination_wholesale; return v > 0 ? <PriceLine label="· Lamination" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-lamination" /> : null; })()}
        {(() => { const v = r.foil_retail ?? r.foil_wholesale; return v > 0 ? <PriceLine label="· Hot Foil" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-foil" /> : null; })()}
        {(() => { const v = r.round_corner_retail ?? r.round_corner_wholesale; return v > 0 ? <PriceLine label="· Round Corners" value={v} tone="muted" testid="price-roundcorner" /> : null; })()}
        {order != null && (
          <div className="flex items-baseline justify-between bg-[#2495D3] text-white px-4 py-3">
            <span className="text-[10px] font-mono uppercase tracking-widest">Order Total</span>
            <span className="num text-2xl font-black" data-testid="price-order-total">{money(order)}</span>
          </div>
        )}
      </div>
      {order != null && (
        <div className="rounded-xl border border-slate-200 mt-2 overflow-hidden" data-testid="rush-pricing">
          <div className="bg-slate-50 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-slate-200">Rush Options</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-1.5">Turnaround</th>
                {retail != null && <th className="text-right px-4 py-1.5">Retail</th>}
                {wholesale != null && <th className="text-right px-4 py-1.5">Wholesale</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-1.5 text-slate-500">Standard</td>
                {retail != null && <td className="px-4 py-1.5 text-right num" data-testid="rush-std-retail">{money(retail)}</td>}
                {wholesale != null && <td className="px-4 py-1.5 text-right num" data-testid="rush-std-ws">{money(wholesale)}</td>}
              </tr>
              {rushRow(`Next day +${rush.next}%`, rush.next)}
              {rushRow(`Same day +${rush.same}%`, rush.same)}
            </tbody>
          </table>
        </div>
      )}
      <ProfitabilityPanel r={r} />
    </div>
  );
}
