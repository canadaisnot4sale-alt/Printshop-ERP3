// Shared modern UI primitives used across every module.
import { money } from "@/lib/format";
import ProfitabilityPanel from "@/components/ProfitabilityPanel";

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
  if (!r) return null;
  const prod = r.base_cost ?? r.total_cost;
  const retail = r.retail_total ?? r.customer_price ?? r.selling_price;
  const wholesale = r.wholesale_total ?? r.wholesale_price;
  const order = retail ?? wholesale;
  return (
    <div className={className} data-testid="pricing-panel-wrap">
      <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="pricing-panel">
        {prod != null && <PriceLine label="Production Cost" value={prod} tone="muted" testid="price-production" />}
        {retail != null && <PriceLine label="Retail Price" value={retail} unit={r.unit_price} tone="retail" testid="price-retail" />}
        {wholesale != null && <PriceLine label="Wholesale Price" value={wholesale} unit={r.wholesale_unit} testid="price-wholesale" />}
        {(() => { const v = r.lamination_retail ?? r.lamination_wholesale; return v > 0 ? <PriceLine label="· Lamination" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-lamination" /> : null; })()}
        {(() => { const v = r.foil_retail ?? r.foil_wholesale; return v > 0 ? <PriceLine label="· Hot Foil" value={v} unit={r.qty ? v / r.qty : undefined} tone="muted" testid="price-foil" /> : null; })()}
        {order != null && (
          <div className="flex items-baseline justify-between bg-[#2495D3] text-white px-4 py-3">
            <span className="text-[10px] font-mono uppercase tracking-widest">Order Total</span>
            <span className="num text-2xl font-black" data-testid="price-order-total">{money(order)}</span>
          </div>
        )}
      </div>
      <ProfitabilityPanel r={r} />
    </div>
  );
}
