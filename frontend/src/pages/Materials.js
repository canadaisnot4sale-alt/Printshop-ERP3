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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Minus, Package, AlertTriangle, Boxes, Star } from "lucide-react";

const CATEGORIES = ["paper", "roll", "substrate"];
const UNITS = ["sheet", "sqft", "each"];
const MODULES = [
  "paper", "booklet", "large-format", "stickers", "dtf", "embroidery",
  "laser", "direct-print", "channel-letters", "sublimation", "roll-stickers",
];

const BLANK = {
  name: "", code: "", category: "paper",
  supplier_company: "", supplier_contact: "", supplier_phone: "", supplier_email: "",
  unit: "sheet", size: "", weight: "", sheet_area_sqft: 0,
  unit_cost: 0, labor_minutes: 0, machine_id: "", ink_coverage_pct: 0,
  click_cost: 0.055, num_boxes: 1, price_per_box: 0,
  price_override: "", retail_markup_pct: "", wholesale_markup_pct: "",
  modules: [], is_default: false, default_modules: [],
  sheet_width: 0, sheet_height: 0, sheets_per_box: 0,
  roll_width: 0, printable_width: 0, min_linear_feet: 1, material_type: "",
  sticker_compatible: false, cnc_capable: true, channel_capable: false,
  pieces_per_roll: 0, sticker_w: 0, sticker_h: 0,
  stock_qty: 0, reorder_point: 0, reorder_target: 0, waste_per_order: 1, notes: "",
};

const NUMS = ["sheet_area_sqft", "unit_cost", "labor_minutes", "ink_coverage_pct",
  "click_cost", "num_boxes", "price_per_box",
  "stock_qty", "reorder_point", "reorder_target", "waste_per_order",
  "sheet_width", "sheet_height", "sheets_per_box", "roll_width", "printable_width",
  "min_linear_feet", "pieces_per_roll", "sticker_w", "sticker_h"];
const OPT_NUMS = ["price_override", "retail_markup_pct", "wholesale_markup_pct"];

export default function Materials() {
  const [items, setItems] = useState([]);
  const [machines, setMachines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [extraCats, setExtraCats] = useState([]);
  const [extraUnits, setExtraUnits] = useState([]);
  const [savePreset, setSavePreset] = useState(false);
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
    api.get("/suppliers").then(({ data }) => setSuppliers(data)).catch(() => {});
  }, []);

  const catOptions = [...new Set([...CATEGORIES, ...extraCats, ...(form.category ? [form.category] : [])])];
  const unitOptions = [...new Set([...UNITS, ...extraUnits, ...(form.unit ? [form.unit] : [])])];
  const isPaper = form.category === "paper";
  const isSubstrate = form.category === "substrate";

  const pickCategory = (v) => {
    if (v === "__add__") {
      const nc = window.prompt("New category name")?.trim().toLowerCase();
      if (nc) { setExtraCats((c) => [...c, nc]); set("category", nc); }
      return;
    }
    set("category", v);
  };
  const pickUnit = (v) => {
    if (v === "__add__") {
      const nu = window.prompt("New unit name")?.trim().toLowerCase();
      if (nu) { setExtraUnits((u) => [...u, nu]); set("unit", nu); }
      return;
    }
    set("unit", v);
  };
  const loadSupplier = (id) => {
    const s = suppliers.find((x) => x.id === id);
    if (s) setForm((f) => ({ ...f, supplier_company: s.company, supplier_contact: s.contact || "", supplier_phone: s.phone || "", supplier_email: s.email || "" }));
  };

  // Live paper cost preview
  const paperUnitCost = isPaper && form.sheets_per_box > 0 ? Number(form.price_per_box || 0) / Number(form.sheets_per_box) : Number(form.unit_cost || 0);
  const clickCost = Number(form.click_cost || 0);
  const printed1 = paperUnitCost + clickCost;
  const printed2 = paperUnitCost + clickCost * 2;
  const paperStock = isPaper ? Number(form.num_boxes || 0) * Number(form.sheets_per_box || 0) : Number(form.stock_qty || 0);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const has = (...mods) => mods.some((m) => form.modules.includes(m));
  const toggleModule = (m) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m],
      default_modules: f.modules.includes(m) ? f.default_modules.filter((x) => x !== m) : f.default_modules }));
  const toggleDefaultModule = (m) =>
    setForm((f) => ({ ...f, default_modules: f.default_modules.includes(m) ? f.default_modules.filter((x) => x !== m) : [...f.default_modules, m] }));

  const openNew = () => { setForm(BLANK); setEditId(null); setOpen(true); };
  const openEdit = (it) => {
    setForm({
      ...BLANK, ...it,
      machine_id: it.machine_id || "",
      price_override: it.price_override ?? "",
      retail_markup_pct: it.retail_markup_pct ?? "",
      wholesale_markup_pct: it.wholesale_markup_pct ?? "",
      modules: it.modules || [],
      default_modules: it.default_modules || [],
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
    if (form.category === "paper" && Number(form.sheets_per_box) > 0) {
      payload.unit_cost = Number((Number(form.price_per_box || 0) / Number(form.sheets_per_box)).toFixed(4));
      payload.stock_qty = Number(form.num_boxes || 0) * Number(form.sheets_per_box);
    }
    // Auto-derive numeric sheet dimensions from the Size field (e.g. "12x18 in" -> 12 x 18)
    const dims = String(form.size || "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (dims && (!Number(payload.sheet_width) || !Number(payload.sheet_height))) {
      payload.sheet_width = Number(dims[1]);
      payload.sheet_height = Number(dims[2]);
    }
    try {
      if (editId) await api.put(`/materials/${editId}`, payload);
      else await api.post("/materials", payload);
      if (savePreset && form.supplier_company.trim()) {
        await api.post("/suppliers", { company: form.supplier_company, contact: form.supplier_contact, phone: form.supplier_phone, email: form.supplier_email }).catch(() => {});
        api.get("/suppliers").then(({ data }) => setSuppliers(data)).catch(() => {});
      }
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
  const defaults = items.filter((m) => (m.default_modules || []).length > 0).length;

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
                      {(m.default_modules || []).map((dm) => (
                        <Badge key={dm} className="bg-amber-100 text-amber-700 border-0 text-[10px]" data-testid="material-default-badge">DEFAULT · {dm}</Badge>
                      ))}
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
          <DialogHeader>
            <DialogTitle className="font-head">{editId ? "Edit" : "New"} material</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Supplier, cost, pricing, inventory and module usage.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Nickname / name</Label>
                <Input data-testid="material-field-name" value={form.name} onChange={(e) => set("name", e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div><Label className="text-xs">Code</Label>
                <Input data-testid="material-field-code" value={form.code} onChange={(e) => set("code", e.target.value)} className="rounded-lg mt-1" /></div>
              <div><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={pickCategory}>
                  <SelectTrigger data-testid="material-field-category" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {catOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="__add__" data-testid="category-add">＋ Add category…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Supplier</div>
                <div className="flex items-center gap-2">
                  {suppliers.length > 0 && (
                    <Select onValueChange={loadSupplier}>
                      <SelectTrigger className="rounded-lg h-7 text-xs w-44" data-testid="supplier-preset-select"><SelectValue placeholder="Load preset…" /></SelectTrigger>
                      <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer" data-testid="supplier-save-toggle">
                    <Switch checked={savePreset} onCheckedChange={setSavePreset} /> Save preset
                  </label>
                </div>
              </div>
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
                  <Select value={form.unit} onValueChange={pickUnit}>
                    <SelectTrigger data-testid="material-field-unit" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      <SelectItem value="__add__" data-testid="unit-add">＋ Add unit…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Size</Label>
                  <Input data-testid="material-field-size" value={form.size} onChange={(e) => set("size", e.target.value)} className="rounded-lg mt-1" placeholder={isPaper ? "12x18 in" : "4x8 ft"} /></div>
                <div><Label className="text-xs">Weight</Label>
                  <Input data-testid="material-field-weight" value={form.weight} onChange={(e) => set("weight", e.target.value)} className="rounded-lg mt-1" placeholder={isPaper ? "100 lb cover" : ""} /></div>
                {isPaper && (
                  <>
                    <div><Label className="text-xs">Sheets per box</Label>
                      <Input data-testid="material-field-sheets_per_box" type="number" value={form.sheets_per_box} onChange={(e) => set("sheets_per_box", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Number of boxes</Label>
                      <Input data-testid="material-field-num_boxes" type="number" value={form.num_boxes} onChange={(e) => set("num_boxes", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Price per box ($)</Label>
                      <Input data-testid="material-field-price_per_box" type="number" value={form.price_per_box} onChange={(e) => set("price_per_box", e.target.value)} className="rounded-lg mt-1" /></div>
                  </>
                )}
                {isSubstrate && (
                  <div><Label className="text-xs">Sheet area (ft²)</Label>
                    <Input data-testid="material-field-sheet_area" type="number" value={form.sheet_area_sqft} onChange={(e) => set("sheet_area_sqft", e.target.value)} className="rounded-lg mt-1" /></div>
                )}
              </div>
              {isPaper && (
                <div className="text-[11px] text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5" data-testid="paper-stock-hint">
                  Auto: unit cost <span className="num font-semibold">{money(paperUnitCost)}</span>/sheet · stock <span className="num font-semibold">{paperStock}</span> sheets
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Cost & pricing</div>
              <div className="grid grid-cols-3 gap-4">
                {!isPaper && (
                  <div><Label className="text-xs">Unit cost ($)</Label>
                    <Input data-testid="material-field-unit_cost" type="number" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} className="rounded-lg mt-1" /></div>
                )}
                <div><Label className="text-xs">Labor (min)</Label>
                  <Input data-testid="material-field-labor" type="number" value={form.labor_minutes} onChange={(e) => set("labor_minutes", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Machine</Label>
                  <Select value={form.machine_id || "none"} onValueChange={(v) => set("machine_id", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="material-field-machine" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isPaper ? (
                  <div><Label className="text-xs">Click cost / side ($)</Label>
                    <Input data-testid="material-field-click_cost" type="number" step="0.001" value={form.click_cost} onChange={(e) => set("click_cost", e.target.value)} className="rounded-lg mt-1" /></div>
                ) : (
                  <div><Label className="text-xs">Ink coverage (%)</Label>
                    <Input type="number" value={form.ink_coverage_pct} onChange={(e) => set("ink_coverage_pct", e.target.value)} className="rounded-lg mt-1" /></div>
                )}
                <div><Label className="text-xs">Price override ($)</Label>
                  <Input data-testid="material-field-price_override" type="number" value={form.price_override} onChange={(e) => set("price_override", e.target.value)} className="rounded-lg mt-1" placeholder="auto" /></div>
                <div><Label className="text-xs">Retail markup %</Label>
                  <Input type="number" value={form.retail_markup_pct} onChange={(e) => set("retail_markup_pct", e.target.value)} className="rounded-lg mt-1" placeholder="default" /></div>
              </div>
              {isPaper && (
                <div className="mt-3 grid grid-cols-3 gap-3" data-testid="paper-printed-cost">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Blank sheet</div>
                    <div className="num text-lg font-bold mt-1">{money(paperUnitCost)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Printed 1 side</div>
                    <div className="num text-lg font-bold text-[#2495D3] mt-1" data-testid="printed-1side">{money(printed1)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Printed 2 sides</div>
                    <div className="num text-lg font-bold text-[#2495D3] mt-1" data-testid="printed-2side">{money(printed2)}</div>
                  </div>
                </div>
              )}
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
                <div><Label className="text-xs">Waste per order ({form.unit})</Label>
                  <Input data-testid="material-field-waste_per_order" type="number" step="0.1" value={form.waste_per_order} onChange={(e) => set("waste_per_order", e.target.value)} className="rounded-lg mt-1" /></div>
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

            {((has("paper", "booklet", "laser") && !isPaper) || has("large-format", "stickers") || has("direct-print", "channel-letters") || has("roll-stickers")) && (
              <div data-testid="material-module-specs">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Module specs</div>
                {has("paper", "booklet", "laser") && !isPaper && (
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div><Label className="text-xs">Sheet width (in)</Label>
                      <Input data-testid="material-field-sheet_width" type="number" value={form.sheet_width} onChange={(e) => set("sheet_width", e.target.value)} className="rounded-lg mt-1" placeholder="auto from Size" /></div>
                    <div><Label className="text-xs">Sheet height (in)</Label>
                      <Input data-testid="material-field-sheet_height" type="number" value={form.sheet_height} onChange={(e) => set("sheet_height", e.target.value)} className="rounded-lg mt-1" placeholder="auto from Size" /></div>
                  </div>
                )}
                {has("large-format", "stickers") && (
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div><Label className="text-xs">Roll width (in)</Label>
                      <Input data-testid="material-field-roll_width" type="number" value={form.roll_width} onChange={(e) => set("roll_width", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Printable width (in)</Label>
                      <Input data-testid="material-field-printable_width" type="number" value={form.printable_width} onChange={(e) => set("printable_width", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Min linear feet</Label>
                      <Input data-testid="material-field-min_linear_feet" type="number" value={form.min_linear_feet} onChange={(e) => set("min_linear_feet", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Material type</Label>
                      <Input data-testid="material-field-material_type" value={form.material_type} onChange={(e) => set("material_type", e.target.value)} className="rounded-lg mt-1" placeholder="vinyl / banner" /></div>
                    <div className="flex items-center gap-2 pt-6">
                      <Switch data-testid="material-field-sticker_compatible" checked={!!form.sticker_compatible} onCheckedChange={(v) => set("sticker_compatible", v)} />
                      <Label className="text-xs">Sticker-compatible</Label>
                    </div>
                  </div>
                )}
                {has("direct-print", "channel-letters") && (
                  <div className="flex flex-wrap gap-6 mb-3">
                    <div className="flex items-center gap-2">
                      <Switch data-testid="material-field-cnc_capable" checked={!!form.cnc_capable} onCheckedChange={(v) => set("cnc_capable", v)} />
                      <Label className="text-xs">CNC-capable (Direct Print)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch data-testid="material-field-channel_capable" checked={!!form.channel_capable} onCheckedChange={(v) => set("channel_capable", v)} />
                      <Label className="text-xs">Channel-capable (Channel Letters)</Label>
                    </div>
                  </div>
                )}
                {has("roll-stickers") && (
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div><Label className="text-xs">Pieces per roll</Label>
                      <Input data-testid="material-field-pieces_per_roll" type="number" value={form.pieces_per_roll} onChange={(e) => set("pieces_per_roll", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Roll width (in)</Label>
                      <Input type="number" value={form.roll_width} onChange={(e) => set("roll_width", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Sticker W (in)</Label>
                      <Input type="number" value={form.sticker_w} onChange={(e) => set("sticker_w", e.target.value)} className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs">Sticker H (in)</Label>
                      <Input type="number" value={form.sticker_h} onChange={(e) => set("sticker_h", e.target.value)} className="rounded-lg mt-1" /></div>
                  </div>
                )}
                <div className="text-[11px] text-slate-400">Unit cost is interpreted per the material's unit: per sheet (paper/laser), per ft² (large-format/direct-print/channel), or per roll (roll-stickers).</div>
              </div>
            )}

            {form.modules.length > 0 && (
              <div data-testid="material-default-modules">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Default material in module</div>
                <div className="flex flex-wrap gap-2">
                  {form.modules.map((m) => (
                    <button key={m} type="button" data-testid={`material-default-${m}`} onClick={() => toggleDefaultModule(m)}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors flex items-center gap-1 ${form.default_modules.includes(m) ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                      <Star size={12} className={form.default_modules.includes(m) ? "fill-white" : ""} /> {m}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">When set, this material is pre-selected when opening that module's calculator (one default per module).</div>
              </div>
            )}
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
