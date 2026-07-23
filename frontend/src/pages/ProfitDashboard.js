import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Receipt, Landmark, FileText } from "lucide-react";

const label = (k) => {
  const [y, m] = (k || "").split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[+m] || m} ${(y || "").slice(2)}`;
};

export default function ProfitDashboard() {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    api.get(`/finance/profit-dashboard?months=${months}`).then(({ data }) => setData(data)).catch(() => {});
  }, [months]);

  const cur = data?.current;
  const chart = (data?.series || []).map((s) => ({ ...s, name: label(s.month) }));
  const profit = (cur?.net_profit ?? 0) >= 0;

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={FileText} label={`Quoted revenue · ${cur ? label(cur.month) : ""}`} value={money(cur?.revenue)} sub={`${cur?.quotes || 0} quotes`} />
          <Metric icon={Receipt} label="Purchases (pre-tax)" value={money(cur?.purchases)} />
          <Metric icon={Landmark} label="Monthly overhead" value={money(data?.monthly_overhead)} sub="fixed + machines" />
          <div className={`rounded-xl border p-4 ${profit ? "bg-emerald-600 border-emerald-600" : "bg-red-600 border-red-600"} text-white`} data-testid="pnl-net-kpi">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/80">
              {profit ? <TrendingUp size={13} /> : <TrendingDown size={13} />} Net profit
            </div>
            <div className="num text-2xl font-black mt-1.5">{money(cur?.net_profit)}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-head font-bold mb-4">Revenue vs cost vs net profit</h3>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chart} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="name" fontSize={12} stroke="#64748b" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={11} stroke="#94a3b8" />
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Quoted revenue" fill="#2495D3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_cost" name="Total cost" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Line dataKey="net_profit" name="Net profit" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
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
