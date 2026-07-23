import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Receipt, Calendar } from "lucide-react";

const fields = [
  { name: "label", label: "Cost name", type: "text", full: true },
  { name: "category", label: "Category", type: "select", options: ["rent", "payroll", "utilities", "misc", "overhead"], default: "overhead" },
  { name: "amount", label: "Amount / month (CAD)", type: "number" },
  { name: "notes", label: "Notes", type: "text", full: true },
];

const columns = [
  { name: "label", label: "Cost" },
  { name: "category", label: "Category" },
  { name: "amount", label: "$/month", mono: true, render: (i) => money(i.amount) },
  { name: "notes", label: "Notes" },
];

export default function FixedCosts() {
  const [items, setItems] = useState([]);
  const monthly = items.reduce((a, f) => a + (f.amount || 0), 0);

  return (
    <div data-testid="fixed-costs-page">
      <PageHeader title="Fixed Costs" eyebrow="Business Control" subtitle="Recurring monthly overhead (rent, payroll, utilities…). Machine leases live in Machinery." />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric icon={Receipt} label="Line Items" value={items.length} />
          <Metric icon={Calendar} label="Overhead / month" value={money(monthly)} accent />
          <Metric icon={Calendar} label="Overhead / year" value={money(monthly * 12)} />
        </div>
        <CrudManager endpoint="fixed-costs" fields={fields} columns={columns} prefix="fixed-cost" onChange={setItems} />
      </div>
    </div>
  );
}
