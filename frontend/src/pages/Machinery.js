import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Cpu, DollarSign, Clock, Wallet } from "lucide-react";

const CATS = ["largeformat", "directprint", "laser", "laserprint", "finishing", "other"];

const fields = [
  { name: "name", label: "Machine name", type: "text", full: true },
  { name: "category", label: "Category", type: "select", options: CATS, default: "largeformat" },
  { name: "acquisition", label: "Acquisition", type: "select", options: ["owned", "leased"], default: "owned" },
  { name: "purchase_price", label: "Purchase price (CAD)", type: "number" },
  { name: "lease_monthly", label: "Lease / month (CAD)", type: "number" },
  { name: "lease_term_months", label: "Lease term (months)", type: "number", default: 48 },
  { name: "useful_life_years", label: "Useful life (years)", type: "number", default: 7 },
  { name: "maintenance_pct_year", label: "Maintenance %/yr", type: "number", default: 2 },
  { name: "productive_hours_month", label: "Productive hrs/mo (0 = shop default)", type: "number" },
  { name: "ink_config", label: "Ink / toner config", type: "text" },
  { name: "ink_details", label: "Ink details (e.g. 8 x 1L @ $310)", type: "text", full: true },
  { name: "ink_ml_per_sqft_full", label: "Ink ml/ft² @ 100% (auto-calibrates)", type: "number", default: 10 },
  { name: "ink_cost_per_ml", label: "Ink cost / ml (CAD)", type: "number", default: 0.25 },
  { name: "notes", label: "Notes", type: "text", full: true },
];

const columns = [
  { name: "name", label: "Machine" },
  { name: "category", label: "Category" },
  { name: "acquisition", label: "Type" },
  { name: "monthly_cost", label: "$/month", mono: true, render: (i) => money(i.monthly_cost) },
  { name: "hourly_cost", label: "$/hour", mono: true, render: (i) => money(i.hourly_cost) },
  { name: "value", label: "Book value", mono: true, render: (i) => money(i.value) },
];

export default function Machinery() {
  const [items, setItems] = useState([]);
  const invest = items.reduce((a, m) => a + (m.purchase_price || 0), 0);
  const monthly = items.reduce((a, m) => a + (m.monthly_cost || 0), 0);
  const lease = items.reduce((a, m) => a + (m.acquisition === "leased" ? (m.lease_monthly || 0) : 0), 0);

  return (
    <div data-testid="machinery-page">
      <PageHeader title="Machinery & Assets" eyebrow="Business Control" subtitle="Every machine: cost/month, cost/hour, maintenance and book value — auto-rolled into your financials" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Cpu} label="Machines" value={items.length} />
          <Metric icon={Wallet} label="Total Investment" value={money(invest)} />
          <Metric icon={DollarSign} label="Machine Cost / mo" value={money(monthly)} accent />
          <Metric icon={Clock} label="Lease Obligations / mo" value={money(lease)} />
        </div>
        <CrudManager endpoint="machines" fields={fields} columns={columns} prefix="machine" onChange={setItems} />
        <p className="text-xs text-slate-400">Monthly cost = (lease OR straight-line depreciation) + maintenance. Hourly cost = monthly ÷ productive hours (per-machine, else shop default). Ink/toner is charged per job in the calculators.</p>
      </div>
    </div>
  );
}
