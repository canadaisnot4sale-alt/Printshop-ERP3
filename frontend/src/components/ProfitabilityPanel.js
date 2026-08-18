import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, AlertTriangle, Clock } from "lucide-react";

const estimateHours = (r) => {
  const area = r?.total_area_sqft ?? r?.area_sqft ?? r?.total?.area_sqft ?? r?.sqft;
  const qty = r?.qty ?? r?.quantity ?? r?.total?.qty;
  if (area) return Math.max(0.25, +(0.25 + area / 40).toFixed(2));
  if (qty) return Math.max(0.25, +(0.25 + qty / 1000).toFixed(2));
  return 0.5;
};

export default function ProfitabilityPanel({ r }) {
  const { user } = useAuth();
  const baseCost = r?.base_cost ?? r?.total_cost;
  const quoted = r?.retail_total ?? r?.customer_price ?? r?.selling_price ?? r?.wholesale_total ?? r?.wholesale_price;

  const [hours, setHours] = useState(estimateHours(r));
  const [machineId, setMachineId] = useState("none");
  const [machines, setMachines] = useState([]);
  const [prof, setProf] = useState(null);

  useEffect(() => { setHours(estimateHours(r)); /* eslint-disable-next-line */ }, [baseCost, quoted]);

  useEffect(() => {
    if (user?.role === "admin") api.get("/machines").then(({ data }) => setMachines(data)).catch(() => {});
  }, [user]);

  const recompute = useCallback(async () => {
    if (baseCost == null || quoted == null) return;
    try {
      const { data } = await api.post("/calc/profitability", {
        base_cost: Number(baseCost), quoted_price: Number(quoted),
        production_hours: Number(hours || 0),
        machine_id: machineId === "none" ? null : machineId,
      });
      setProf(data);
    } catch { /* admin-only; ignore */ }
  }, [baseCost, quoted, hours, machineId]);

  useEffect(() => {
    const t = setTimeout(recompute, 300);
    return () => clearTimeout(t);
  }, [recompute]);

  if (user?.role !== "admin" || baseCost == null || quoted == null) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mt-4" data-testid="profitability-panel">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white">
        <TrendingUp size={15} />
        <span className="text-[10px] font-mono uppercase tracking-widest">Profitability · true manufacturing cost</span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 border-b border-slate-100">
        <div>
          <Label className="text-[11px] flex items-center gap-1"><Clock size={12} /> Production time (h)</Label>
          <Input type="number" step="0.25" data-testid="profit-hours-input" value={hours}
            onChange={(e) => setHours(e.target.value)} className="rounded-lg mt-1 h-8 num" />
        </div>
        <div>
          <Label className="text-[11px]">Machine (optional)</Label>
          <Select value={machineId} onValueChange={setMachineId}>
            <SelectTrigger data-testid="profit-machine-select" className="rounded-lg mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Shop rate only</SelectItem>
              {machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {prof && (
        <div className="text-sm">
          <Row label="Base production cost" value={prof.base_cost} />
          {r?.lamination_cost > 0 && <Row label="· Lamination (cost)" value={r.lamination_cost} sub="incl. in base cost" />}
          {r?.foil_cost > 0 && <Row label="· Hot Foil (cost)" value={r.foil_cost} sub="incl. in base cost" />}
          <Row label={`Labor · ${prof.production_hours}h × ${money(prof.shop_rate)}/h`} value={prof.labor_cost}
            sub={`overhead ${money(prof.business_hourly)}/h${prof.machine_hourly ? ` + machine ${money(prof.machine_hourly)}/h` : ""}`} />
          <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-700">True manufacturing cost</span>
            <span className="num font-bold text-slate-900" data-testid="profit-true-cost">{money(prof.true_manufacturing_cost)}</span>
          </div>
          <Row label="Quoted price (retail)" value={prof.quoted_price} tone="blue" />
          <div className={`flex items-baseline justify-between px-4 py-3 ${prof.below_cost ? "bg-red-600" : "bg-emerald-600"} text-white`}>
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {prof.below_cost ? "Loss" : "Profit"} · {prof.margin_pct}% margin
            </span>
            <span className="num text-xl font-black" data-testid="profit-margin">{money(prof.margin)}</span>
          </div>
          {prof.below_cost && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-600 bg-red-50" data-testid="profit-below-cost-alert">
              <AlertTriangle size={14} /> This price is BELOW your true manufacturing cost.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, sub, tone }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-2 border-b border-slate-100">
      <span className="text-xs text-slate-500">
        {label}{sub && <span className="block text-[10px] text-slate-400">{sub}</span>}
      </span>
      <span className={`num font-semibold ${tone === "blue" ? "text-[#2495D3]" : "text-slate-700"}`}>{money(value)}</span>
    </div>
  );
}
