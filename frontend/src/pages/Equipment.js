import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { money, num } from "@/lib/format";

const eqFields = [
  { name: "name", label: "Printer Name", type: "text", full: true },
  { name: "ink_config", label: "Ink Config", type: "select", options: ["CMYK", "CMYK + Lc + Lm", "CMYK + Wh", "CMYK + Lc + Lm + Wh"], default: "CMYK" },
  { name: "cartridge_ml", label: "Cartridge (ml)", type: "select", options: ["220", "440", "500", "1000"], default: "220" },
  { name: "ink_price", label: "Ink Price / Cartridge (CAD)", type: "number", default: 180 },
  { name: "ink_consumption_ml_sqft", label: "Ink Consumption (ml/sqft)", type: "number", default: 0.5 },
  { name: "maintenance_pct", label: "Monthly Maintenance %", type: "number", default: 5 },
];
const eqCols = [
  { name: "name", label: "Printer" },
  { name: "ink_config", label: "Ink" },
  { name: "cartridge_ml", label: "Cartridge", mono: true, render: (i) => `${num(i.cartridge_ml, 0)}ml` },
  { name: "ink_price", label: "Ink Price", mono: true, render: (i) => money(i.ink_price) },
  { name: "maintenance_pct", label: "Maint %", mono: true, render: (i) => `${num(i.maintenance_pct, 0)}%` },
];

export default function Equipment() {
  const [list, setList] = useState([]);
  const [costs, setCosts] = useState({});

  const analyze = async (items) => {
    const map = {};
    for (const e of items) {
      try { const { data } = await api.get(`/calc/equipment/${e.id}`); map[e.id] = data.cost; } catch (x) {}
    }
    setCosts(map);
  };

  useEffect(() => {
    api.get("/equipment").then((r) => { setList(r.data); analyze(r.data); });
  }, []);

  return (
    <div data-testid="equipment-page">
      <PageHeader title="Equipment & Production Cost" subtitle="Printers · ink · true cost per sqft" />
      <div className="p-8">
        <Tabs defaultValue="analysis">
          <TabsList className="rounded-sm">
            <TabsTrigger value="analysis" data-testid="tab-analysis">Cost Analysis</TabsTrigger>
            <TabsTrigger value="manage" data-testid="tab-manage">Manage Printers</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="equipment-analysis">
              {list.map((e) => {
                const c = costs[e.id];
                return (
                  <div key={e.id} className="bg-white border border-slate-200 rounded-sm p-6">
                    <div className="font-head font-bold">{e.name}</div>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">{e.ink_config} · {num(e.cartridge_ml, 0)}ml</div>
                    {c && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm num"><span className="text-slate-500">Cost / ml</span><span>{money(c.cost_per_ml)}</span></div>
                        <div className="flex justify-between text-sm num"><span className="text-slate-500">Ink / sqft</span><span>{money(c.ink_cost_per_sqft)}</span></div>
                        <div className="pt-3 mt-1 border-t border-slate-200">
                          <div className="text-xs font-mono uppercase tracking-widest text-slate-500">True Cost / sqft</div>
                          <div className="num text-3xl font-black text-[#2495D3] mt-1">{money(c.true_cost_per_sqft)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {list.length === 0 && <div className="text-slate-400 text-sm">No printers registered yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="manage" className="mt-6">
            <CrudManager endpoint="equipment" fields={eqFields} columns={eqCols} prefix="equipment" onChange={(d) => { setList(d); analyze(d); }} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
