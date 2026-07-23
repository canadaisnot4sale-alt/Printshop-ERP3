import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Minus, Package, AlertTriangle, Boxes, Star } from "lucide-react";

const CATEGORIES = ["sheet", "roll", "ink", "laminate", "substrate", "other"];
const UNITS = ["sheet", "sqft", "roll", "each"];
const MODULES = [
  "paper", "booklet", "large-format", "stickers", "dtf", "embroidery",
  "laser", "direct-print", "channel-letters", "sublimation", "roll-stickers",
];

const BLANK = {
  name: "", code: "", category: "sheet",
  supplier_company: "", supplier_contact: "", supplier_phone: "", supplier_email: "",
  unit: "sheet", size: "", gramage: "", weight: "", sheet_area_sqft: 0,
  unit_cost: 0, labor_minutes: 0, machine_id: "", ink_coverage_pct: 0,
  price_override: "", retail_markup_pct: "", wholesale_markup_pct: "",
  modules: [], is_default: false,
  stock_qty: 0, reorder_point: 0, reorder_target: 0, notes: "",
};

const NUMS = ["sheet_area_sqft", "unit_cost", "labor_minutes", "ink_coverage_pct",
  "stock_qty", "reorder_point", "reorder_target"];
const OPT_NUMS = ["price_override", "retail_markup_pct", "wholesale_markup_pct"];

export default function Materials() {
  const [items, setItems] = useState([]);
  const [machines, setMachines] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    const { data } = await api.get("/materials");
    setItems(data);
  };
  useEffect(() => {
    load();
    api.get("/machines").then(({ data }) => setMachines(data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleModule = (m) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] }));

  const openNew = () => { setForm(BLANK); setEditId(null); setOpen(true); };
  const openEdit = (it) => {
    setForm({
      ...BLANK, ...it,
      machine_id: it.machine_id || "",
      price_override: it.price_override ?? "",
      retail_markup_pct: it.retail_markup_pct ?? "",
      wholesale_markup_pct: it.wholesale_markup_pct ?? "",
      modules: it.modules || [],
    });
    setEditId(it.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const payload = { ...form };
    NUMS.forEach((k) => (payload[k] = Number(payload[k] || 0)));
    OPT_NUMS.forEach((k) => (payload[k] = payload[k] === "" || payload[k] == null ? null : Number(payload[k])));
    payload.machine_id = form.machine_id || null;
    try {
      if (editId) await api.put(`/materials/${editId}`, payload);
      else await api.post("/materials", payload);
      toast.success("Material saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this material?")) return;
    await api.delete(`/materials/${id}`);
    toast.success("Deleted");
    load();
  };

  const adjust = async (id, delta) => {
    await api.post(`/materials/${id}/adjust-stock`, { delta, reason: "manual" });
    load();
  };

  const lowCount = items.filter((m) => m.low_stock).length;
  const invValue = items.reduce((a, m) => a + (m.stock_qty || 0) * (m.unit_cost || 0), 0);
  const defaults = items.filter((m) => m.is_default).length;

  return (
    <div data-testid="materials-page">
      <PageHeader title="Materials" eyebrow="Business Control"
        subtitle="Unified materials database — supplier info, finish cost, price overrides, inventory & reorder alerts.">
        <Button data-testid="material-add-button" onClick={openNew} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
          <Plus size={16} className="mr-1" /> New material
        </Button>
      </PageHeader>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Boxes} label="Materials" value={items.length} />
          <Metric icon={AlertTriangle} label="Low stock" value={lowCount} accent={lowCount > 0} />
          <Metric icon={Star} label="Defaults set" value={defaults} />
          <Metric icon={Package} label="Inventory value" value={money(invValue)} />
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <th className="text-left px-4 py-2.5">Material</th>
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-right px-4 py-2.5">Unit cost</th>
                <th className="text-right px-4 py-2.5">Finish cost</th>
                <th className="text-right px-4 py-2.5">Retail</th>
                <th className="text-center px-4 py-2.5">Stock</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} data-testid="material-row"
                  className={`border-b border-slate-100 hover:bg-slate-50 ${m.below_cost ? "bg-red-50/60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium flex items-center gap-2">
                      {m.name}
                      {m.is_default && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]" data-testid="material-default-badge">DEFAULT</Badge>}
                      {m.below_cost && <Badge className="bg-red-100 text-red-700 border-0 text-[10px]" data-testid="material-belowcost-badge">BELOW COST</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">{m.category}{m.code ? ` · ${m.code}` : ""}{m.size ? ` · ${m.size}` : ""}</div>
                    {m.modules?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.modules.map((x) => <span key={x} className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{x}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-slate-700">{m.supplier_company || "—"}</div>
                    <div className="text-[11px] text-slate-400">{m.supplier_email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right num">{money(m.unit_cost)}</td>
                  <td className="px-4 py-2.5 text-right num font-semibold">{money(m.finish_cost)}</td>
                  <td className="px-4 py-2.5 text-right num text-[#2495D3]">{money(m.selling_price)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button data-testid="material-stock-minus" onClick={() => adjust(m.id, -1)} className="p-1 text-slate-400 hover:text-red-500"><Minus size={13} /></button>
                      <span className={`num w-14 text-center font-semibold ${m.low_stock ? "text-red-600" : "text-slate-700"}`} data-testid="material-stock-value">{m.stock_qty}</span>
                      <button data-testid="material-stock-plus" onClick={() => adjust(m.id, 1)} className="p-1 text-slate-400 hover:text-emerald-600"><Plus size={13} /></button>
                    </div>
                    <div className="text-[10px] text-slate-400 text-center num">rp {m.reorder_point}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button data-testid="material-edit" onClick={() => openEdit(m)} className="p-1.5 text-slate-400 hover:text-[#2495D3]"><Pencil size={15} /></button>
                      <button data-testid="material-delete" onClick={() => remove(m.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No materials yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="material-dialog">
          <DialogHeader><DialogTitle className="font-head">{editId ? "Edit" : "New"} material</DialogTitle></DialogHeader>

          <div className="space-y-5 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Nickname / name</Label>
                <Input data-testid="material-field-name" value={form.name} onChange={(e) => set("name", e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div><Label className="text-xs">Code</Label>
                <Input data-testid="material-field-code" value={form.code} onChange={(e) => set("code", e.target.value)} className="rounded-lg mt-1" /></div>
              <div><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger data-testid="material-field-category" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Supplier</div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs">Company</Label>
                  <Input data-testid="material-field-supplier_company" value={form.supplier_company} onChange={(e) => set("supplier_company", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Contact</Label>
                  <Input value={form.supplier_contact} onChange={(e) => set("supplier_contact", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Phone</Label>
                  <Input value={form.supplier_phone} onChange={(e) => set("supplier_phone", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Email</Label>
                  <Input data-testid="material-field-supplier_email" value={form.supplier_email} onChange={(e) => set("supplier_email", e.target.value)} className="rounded-lg mt-1" /></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Specs</div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs">Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                    <SelectTrigger data-testid="material-field-unit" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Size</Label>
                  <Input value={form.size} onChange={(e) => set("size", e.target.value)} className="rounded-lg mt-1" placeholder="4x8 ft" /></div>
                <div><Label className="text-xs">Gramage</Label>
                  <Input value={form.gramage} onChange={(e) => set("gramage", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Weight</Label>
                  <Input value={form.weight} onChange={(e) => set("weight", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Sheet area (ft²)</Label>
                  <Input type="number" value={form.sheet_area_sqft} onChange={(e) => set("sheet_area_sqft", e.target.value)} className="rounded-lg mt-1" /></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Cost & pricing</div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs">Unit cost ($)</Label>
                  <Input data-testid="material-field-unit_cost" type="number" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Labor (min)</Label>
                  <Input type="number" value={form.labor_minutes} onChange={(e) => set("labor_minutes", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Machine</Label>
                  <Select value={form.machine_id || "none"} onValueChange={(v) => set("machine_id", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="material-field-machine" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Ink coverage (%)</Label>
                  <Input type="number" value={form.ink_coverage_pct} onChange={(e) => set("ink_coverage_pct", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Price override ($)</Label>
                  <Input data-testid="material-field-price_override" type="number" value={form.price_override} onChange={(e) => set("price_override", e.target.value)} className="rounded-lg mt-1" placeholder="auto" /></div>
                <div><Label className="text-xs">Retail markup %</Label>
                  <Input type="number" value={form.retail_markup_pct} onChange={(e) => set("retail_markup_pct", e.target.value)} className="rounded-lg mt-1" placeholder="default" /></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Inventory</div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs">Stock qty</Label>
                  <Input data-testid="material-field-stock_qty" type="number" value={form.stock_qty} onChange={(e) => set("stock_qty", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Reorder point</Label>
                  <Input data-testid="material-field-reorder_point" type="number" value={form.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Reorder target</Label>
                  <Input data-testid="material-field-reorder_target" type="number" value={form.reorder_target} onChange={(e) => set("reorder_target", e.target.value)} className="rounded-lg mt-1" /></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Used in modules</div>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((m) => (
                  <button key={m} type="button" data-testid={`material-module-${m}`} onClick={() => toggleModule(m)}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${form.modules.includes(m) ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch data-testid="material-field-is_default" checked={!!form.is_default} onCheckedChange={(v) => set("is_default", v)} />
              <Label className="text-xs">Mark as DEFAULT material for its category</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="material-save-button" onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
