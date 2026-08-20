import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Receipt, Landmark, FileText } from "lucide-react";
import SalesInsights from "@/components/SalesInsights";

const label = (k) => {
  const [y, m] = (k || "").split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[+m] || m} ${(y || "").slice(2)}`;
};

export default function ProfitDashboard() {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState(6);
  const [goals, setGoals] = useState(null);

  useEffect(() => {
    api.get(`/finance/profit-dashboard?months=${months}`).then(({ data }) => setData(data)).catch(() => {});
  }, [months]);
  useEffect(() => {
    api.get(`/finance/goals`).then(({ data }) => setGoals(data)).catch(() => {});
  }, []);

  const cur = data?.current;
  const chart = (data?.series || []).map((s) => ({ ...s, name: label(s.month) }));
  const profit = (cur?.net_profit ?? 0) >= 0;
  const breakEven = data?.break_even_revenue ?? 0;
  const gap = Math.max(0, breakEven - (cur?.revenue ?? 0));

  return (
    <div data-testid="profit-dashboard-page">
      <PageHeader title="Profit & Loss" eyebrow="Business Control"
        subtitle="Monthly quoted revenue vs purchases & overhead → net profit. Revenue = quoted this month (not yet confirmed sales).">
        <select data-testid="pnl-range" value={months} onChange={(e) => setMonths(+e.target.value)}
          className="rounded-lg border border-slate-200 text-sm px-3 py-1.5 bg-white">
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </PageHeader>

      <div className="p-8 space-y-6">
        {goals && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="goals-panel">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400">Sales goals (to cover all costs)</div>
                <div className={`text-sm font-semibold ${goals.making_money ? "text-emerald-600" : "text-red-500"}`} data-testid="making-money">
                  {goals.making_money ? "✅ You are making money this month" : "⚠️ Below break-even this month"} · Net real: {money(goals.net_real)}
                </div>
              </div>
              <div className="text-xs text-slate-500">Margin {goals.gross_margin_pct}% · Overhead {money(goals.monthly_overhead)}/mo</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[["Daily", goals.goals.day], ["Weekly", goals.goals.week], ["Monthly", goals.goals.month], ["Yearly", goals.goals.year]].map(([lb, v]) => (
                <div key={lb} className="rounded-xl bg-slate-50 border border-slate-100 p-3" data-testid={`goal-${lb.toLowerCase()}`}>
                  <div className="text-[11px] text-slate-400 uppercase tracking-widest">{lb} goal</div>
                  <div className="text-lg font-black text-slate-800 num">{money(v)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500">This month: <b className="num">{money(goals.sales_month)}</b> of <b className="num">{money(goals.goals.month)}</b></span>
              <span className={`font-semibold ${goals.progress_pct >= goals.expected_pace_pct ? "text-emerald-600" : "text-amber-600"}`} data-testid="goal-progress">{goals.progress_pct}%</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#2495D3] to-emerald-500 transition-all" style={{ width: `${Math.min(100, goals.progress_pct)}%` }} />
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Expected pace by today: ~{goals.expected_pace_pct}% of the month</div>
          </div>
        )}
        <SalesInsights />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={FileText} label={`Quoted · ${cur ? label(cur.month) : ""}`} value={money(cur?.revenue)} sub={`${cur?.quotes || 0} quotes`} />
          <Metric icon={Receipt} label="Real sales (orders)" value={money(cur?.sales)} accent={(cur?.sales ?? 0) > 0} />
          <Metric icon={Landmark} label="Purchases + overhead" value={money((cur?.purchases ?? 0) + (data?.monthly_overhead ?? 0))} />
          <div className={`rounded-xl border p-4 ${(cur?.net_real ?? 0) >= 0 ? "bg-emerald-600 border-emerald-600" : "bg-red-600 border-red-600"} text-white`} data-testid="pnl-net-kpi">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/80">
              {(cur?.net_real ?? 0) >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} Net profit (real sales)
            </div>
            <div className="num text-2xl font-black mt-1.5">{money(cur?.net_real)}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-head font-bold">Revenue vs cost vs net profit</h3>
            {breakEven > 0 && (
              <div className="text-xs text-slate-500" data-testid="pnl-breakeven-note">
                Break-even: <span className="num font-semibold text-slate-800">{money(breakEven)}</span>/mo
                {gap > 0
                  ? <> · <span className="text-red-600 num">{money(gap)}</span> more to quote this month</>
                  : <> · <span className="text-emerald-600">covered ✓</span></>}
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chart} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" fontSize={12} stroke="#64748b" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={11} stroke="#94a3b8" />
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {breakEven > 0 && (
                <ReferenceLine y={breakEven} stroke="#dc2626" strokeDasharray="5 4"
                  label={{ value: `Break-even ${money(breakEven)}`, position: "insideTopRight", fill: "#dc2626", fontSize: 11 }} />
              )}
              <Bar dataKey="revenue" name="Quoted" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sales" name="Real sales" fill="#2495D3" radius={[4, 4, 0, 0]} />
              <Line dataKey="net_real" name="Net profit (real)" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <th className="text-left px-4 py-2.5">Month</th>
                <th className="text-right px-4 py-2.5">Quotes</th>
                <th className="text-right px-4 py-2.5">Revenue</th>
                <th className="text-right px-4 py-2.5">Purchases</th>
                <th className="text-right px-4 py-2.5">Overhead</th>
                <th className="text-right px-4 py-2.5">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {[...(data?.series || [])].reverse().map((s) => (
                <tr key={s.month} data-testid="pnl-row" className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium">{label(s.month)}</td>
                  <td className="px-4 py-2.5 text-right num text-slate-500">{s.quotes}</td>
                  <td className="px-4 py-2.5 text-right num text-[#2495D3]">{money(s.revenue)}</td>
                  <td className="px-4 py-2.5 text-right num">{money(s.purchases)}</td>
                  <td className="px-4 py-2.5 text-right num text-slate-500">{money(s.overhead)}</td>
                  <td className={`px-4 py-2.5 text-right num font-semibold ${s.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(s.net_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
