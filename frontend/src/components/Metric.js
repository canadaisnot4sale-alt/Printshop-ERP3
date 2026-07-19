// Shared modern UI primitives used across every module.

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
