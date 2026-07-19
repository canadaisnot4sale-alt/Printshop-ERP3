import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { Package, Plus, Trash2 } from "lucide-react";

const MODULES = ["paper", "largeformat", "laser", "sublimation", "rollsticker", "dtf", "directprint", "general"];
const MODULE_LABEL = {
  paper: "Paper Printing", largeformat: "Large Format", laser: "Laser", sublimation: "Sublimation",
  rollsticker: "Roll Stickers", dtf: "DTF / Apparel", directprint: "Direct Print", general: "General",
};

const eqFields = [
  { name: "name", label: "Printer / Machine Name", type: "text", full: true },
  { name: "module", label: "Module", type: "select", options: MODULES, default: "general" },
  { name: "ink_config", label: "Ink Config", type: "select", options: ["CMYK", "CMYK + Lc + Lm", "CMYK + Wh", "CMYK + Lc + Lm + Wh", "N/A"], default: "CMYK" },
  { name: "cartridge_ml", label: "Cartridge (ml)", type: "number", default: 220 },
  { name: "ink_price", label: "Ink Price / Cartridge (CAD)", type: "number", default: 180 },
  { name: "ink_consumption_ml_sqft", label: "Ink Consumption (ml/sqft)", type: "number", default: 0.5 },
  { name: "maintenance_pct", label: "Monthly Maintenance %", type: "number", default: 5 },
];
const eqCols = [
  { name: "name", label: "Machine" },
  { name: "module", label: "Module", render: (i) => MODULE_LABEL[i.module] || i.module },
  { name: "ink_config", label: "Ink" },
  { name: "ink_price", label: "Ink Price", mono: true, render: (i) => money(i.ink_price) },
];

function SuppliesDialog({ machine, open, onClose }) {
  const [supplies, setSupplies] = useState([]);
  const [form, setForm] = useState({ name: "", supplier: "", part_number: "", description: "", price: 0, purchase_date: "", install_date: "" });

  const load = () => api.get(`/equipment/${machine.id}/supplies`).then((r) => setSupplies(r.data));
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const add = async () => {
    try {
      await api.post("/equipment-supplies", { ...form, price: +form.price, equipment_id: machine.id });
      toast.success("Supply added");
      setForm({ name: "", supplier: "", part_number: "", description: "", price: 0, purchase_date: "", install_date: "" });
      load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };
  const remove = async (id) => { await api.delete(`/equipment-supplies/${id}`); load(); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-sm max-w-2xl" data-testid="supplies-dialog">
        <DialogHeader><DialogTitle className="font-head">Supplies — {machine.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <Input data-testid="supply-name" placeholder="Part / name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm" />
          <Input data-testid="supply-supplier" placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="rounded-sm" />
          <Input data-testid="supply-part" placeholder="Part #" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} className="rounded-sm" />
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-sm col-span-2" />
          <Input type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded-sm num" />
          <div><Label className="text-[10px] text-slate-500">Purchased</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="rounded-sm" /></div>
          <div><Label className="text-[10px] text-slate-500">Installed</Label><Input type="date" value={form.install_date} onChange={(e) => setForm({ ...form, install_date: e.target.value })} className="rounded-sm" /></div>
          <Button data-testid="supply-add" onClick={add} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm self-end"><Plus size={15} className="mr-1" />Add</Button>
        </div>
        <div className="border border-slate-200 rounded-sm overflow-hidden mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
              <th className="text-left px-3 py-2">Part</th><th className="text-left px-3 py-2">Supplier</th><th className="text-left px-3 py-2">Part #</th><th className="text-right px-3 py-2">Price</th><th className="text-left px-3 py-2">Installed</th><th></th>
            </tr></thead>
            <tbody>
              {supplies.map((s) => (
                <tr key={s.id} data-testid="supply-row" className="border-b border-slate-100">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 text-slate-500">{s.supplier || "—"}</td>
                  <td className="px-3 py-2 num text-slate-500">{s.part_number || "—"}</td>
                  <td className="px-3 py-2 text-right num">{money(s.price)}</td>
                  <td className="px-3 py-2 num text-slate-500">{s.install_date || "—"}</td>
                  <td className="px-3 py-2 text-right"><button data-testid="supply-delete" onClick={() => remove(s.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {supplies.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No supplies logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-sm">Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Equipment() {
  const [list, setList] = useState([]);
  const [costs, setCosts] = useState({});
  const [supplyMachine, setSupplyMachine] = useState(null);

  const analyze = async (items) => {
    const map = {};
    for (const e of items) {
      try { const { data } = await api.get(`/calc/equipment/${e.id}`); map[e.id] = data.cost; } catch (x) {}
    }
    setCosts(map);
  };
  useEffect(() => { api.get("/equipment").then((r) => { setList(r.data); analyze(r.data); }); }, []);

  const byModule = {};
  list.forEach((e) => { (byModule[e.module || "general"] = byModule[e.module || "general"] || []).push(e); });

  return (
    <div data-testid="equipment-page">
      <PageHeader title="Equipment & Production Cost" subtitle="Machines by module · ink config · supplies · true cost/sqft" />
      <div className="p-8">
        <Tabs defaultValue="analysis">
          <TabsList className="rounded-sm">
            <TabsTrigger value="analysis" data-testid="tab-analysis">By Module</TabsTrigger>
            <TabsTrigger value="manage" data-testid="tab-manage">Manage Machines</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-6" data-testid="equipment-analysis">
            {Object.keys(byModule).sort().map((mod) => (
              <div key={mod} className="mb-8">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#2495D3] mb-3">{MODULE_LABEL[mod] || mod}</div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byModule[mod].map((e) => {
                    const c = costs[e.id];
                    return (
                      <div key={e.id} className="bg-white border border-slate-200 rounded-sm p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-head font-bold">{e.name}</div>
                            <div className="text-xs font-mono text-slate-500 mt-0.5">{e.ink_config} · {num(e.cartridge_ml, 0)}ml</div>
                          </div>
                          <button data-testid="manage-supplies" onClick={() => setSupplyMachine(e)} className="text-slate-400 hover:text-[#2495D3]" title="Supplies"><Package size={17} /></button>
                        </div>
                        {c && (
                          <div className="mt-4 pt-3 border-t border-slate-200">
                            <div className="text-xs font-mono uppercase tracking-widest text-slate-500">True Cost / sqft</div>
                            <div className="num text-3xl font-black text-[#2495D3] mt-1">{money(c.true_cost_per_sqft)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {list.length === 0 && <div className="text-slate-400 text-sm">No machines registered yet.</div>}
          </TabsContent>

          <TabsContent value="manage" className="mt-6">
            <CrudManager endpoint="equipment" fields={eqFields} columns={eqCols} prefix="equipment" onChange={(d) => { setList(d); analyze(d); }} />
          </TabsContent>
        </Tabs>
      </div>
      {supplyMachine && <SuppliesDialog machine={supplyMachine} open={!!supplyMachine} onClose={() => setSupplyMachine(null)} />}
    </div>
  );
}
