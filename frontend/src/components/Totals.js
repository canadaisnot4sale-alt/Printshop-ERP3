import { money } from "@/lib/format";

// Shows only the price fields the API returned (role-scrubbed on the server).
export function TotalsBlock({ r }) {
  const retail = r.retail_total ?? r.customer_price ?? r.selling_price;
  const wholesale = r.wholesale_total ?? r.wholesale_price;
  const unit = r.unit_price;
  const wunit = r.wholesale_unit;
  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      {retail != null && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Precio Retail</div>
          <div className="num text-3xl font-black text-[#2495D3]">{money(retail)}</div>
          {unit != null && <div className="text-xs text-slate-500 num">{money(unit)} / unidad</div>}
        </>
      )}
      {wholesale != null && (
        <div className={retail != null ? "mt-2" : ""}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Precio Wholesale</div>
          <div className={`num font-black text-[#2495D3] ${retail != null ? "text-xl" : "text-3xl"}`}>{money(wholesale)}</div>
          {wunit != null && <div className="text-xs text-slate-500 num">{money(wunit)} / unidad</div>}
        </div>
      )}
    </div>
  );
}

export function CostRow({ label, value }) {
  if (value == null) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-100 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="num tabular">{money(value)}</span>
    </div>
  );
}
