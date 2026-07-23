import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric, SectionLabel } from "@/components/Metric";
import { money } from "@/lib/format";
import { Building2, Cpu, Flame, Clock, Target, FileText, Wallet, Percent } from "lucide-react";

export default function Financials() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/finance/summary").then((r) => setD(r.data)); }, []);

  if (!d) return <div className="p-10 font-mono text-sm text-slate-400">Loading financials…</div>;

  const beProgress = d.break_even_revenue_monthly ? Math.min(100, (d.quoted_this_month / d.break_even_revenue_monthly) * 100) : 0;

  return (
    <div data-testid="financials-page">
      <PageHeader title="Financial Control" eyebrow="Business Control" subtitle="Your monthly nut, shop hourly rate, break-even and business value — updates automatically as you add machines & costs" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Building2} label="Overhead / mo" value={money(d.overhead_monthly)} sub={`${d.fixed_cost_count} fixed costs`} />
          <Metric icon={Cpu} label="Machines / mo" value={money(d.machines_monthly)} sub={`${d.machine_count} machines`} />
          <Metric icon={Flame} label="Total Monthly Cost" value={money(d.total_monthly_cost)} accent />
          <Metric icon={Clock} label="Business Hourly Rate" value={money(d.business_hourly_rate)} sub={`${d.open_hours_per_month} h/mo`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Target} label="Break-even Revenue / mo" value={money(d.break_even_revenue_monthly)} sub={`@ ${d.gross_margin_pct}% margin`} />
          <Metric icon={FileText} label="Quoted This Month" value={money(d.quoted_this_month)} sub={`${d.quotes_this_month} quotes`} />
          <Metric icon={Wallet} label="Equipment Investment" value={money(d.total_equipment_investment)} sub={`${money(d.monthly_lease_obligations)}/mo leases`} />
          <Metric icon={Percent} label="Sales Tax (BC)" value={`GST ${d.gst_pct}% + PST ${d.pst_pct}%`} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Break-even Progress (quoted vs target)</SectionLabel>
            <span className="num text-sm font-bold text-[#2495D3]">{beProgress.toFixed(0)}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-[#2495D3] transition-all" style={{ width: `${beProgress}%` }} data-testid="breakeven-bar" />
          </div>
          <p className="text-xs text-slate-400 mt-2">You must generate ≈ {money(d.break_even_revenue_monthly)} in sales/month to cover {money(d.total_monthly_cost)} of fixed + machine costs (at your current {d.gross_margin_pct}% gross margin). "Quoted this month" is an estimate from saved quotes — real sales arrive with the storefront (Phase 4).</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><SectionLabel className="mb-0">Fixed Costs</SectionLabel></div>
            <table className="w-full text-sm">
              <tbody>
                {d.fixed_costs.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">{f.label}<span className="ml-2 text-[10px] font-mono uppercase text-slate-400">{f.category}</span></td>
                    <td className="px-4 py-2.5 text-right num tabular text-slate-700">{money(f.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold"><td className="px-4 py-2.5">Total overhead</td><td className="px-4 py-2.5 text-right num tabular text-[#2495D3]">{money(d.overhead_monthly)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><SectionLabel className="mb-0">Machines · monthly & hourly</SectionLabel></div>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] font-mono uppercase text-slate-400"><th className="text-left px-4 py-1.5">Machine</th><th className="text-right px-4 py-1.5">$/mo</th><th className="text-right px-4 py-1.5">$/hr</th></tr></thead>
              <tbody>
                {d.machines.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">{m.name}<span className="ml-2 text-[10px] font-mono uppercase text-slate-400">{m.acquisition}</span></td>
                    <td className="px-4 py-2.5 text-right num tabular text-slate-700">{money(m.monthly_cost)}</td>
                    <td className="px-4 py-2.5 text-right num tabular text-slate-700">{money(m.hourly_cost)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold"><td className="px-4 py-2.5">Total machines</td><td className="px-4 py-2.5 text-right num tabular text-[#2495D3]">{money(d.machines_monthly)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
