import { useEffect, useState } from "react";
import api, { apiErr, API } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import TrainingVideoManager from "@/components/TrainingVideoManager";
import { Plus, Pencil, Trash2, Package, CheckCircle2, Eye, AlertTriangle, Megaphone, Copy, Sparkles, Video } from "lucide-react";

const BLANK = { name: "", category: "Other", price: 0, wholesale_price: 0, description: "", published: false, bom: [] };

export default function ProductsCatalog() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [dlgVideos, setDlgVideos] = useState([]);
  const [removedVideoIds, setRemovedVideoIds] = useState([]);
  const [cfgVideos, setCfgVideos] = useState([]);
  const [cfgRemovedVideoIds, setCfgRemovedVideoIds] = useState([]);
  const [cfgProd, setCfgProd] = useState(null);
  const [regenTone, setRegenTone] = useState("professional");
  const [regenLoading, setRegenLoading] = useState(false);
  const copy = (t) => { navigator.clipboard.writeText(t || ""); toast.success("Copied"); };
  const openConfig = (p) => {
    setCfgProd(JSON.parse(JSON.stringify(p))); setRegenTone("professional"); setCfgRemovedVideoIds([]);
    api.get("/training/videos", { params: { category: "product", ref_id: p.id } })
      .then(({ data }) => setCfgVideos(data.map((v) => ({ id: v.id, url: v.url, title_es: v.title_es || "", title_en: v.title_en || "" }))))
      .catch(() => setCfgVideos([]));
  };
  const setC = (patch) => setCfgProd((p) => ({ ...p, ...patch }));
  const setBomC = (i, k, v) => setCfgProd((p) => { const bom = [...(p.bom || [])]; bom[i] = { ...bom[i], [k]: v }; if (k === "material_id") { const m = materials.find((x) => x.id === v); bom[i].material_name = m?.name || ""; } return { ...p, bom }; });
  const addBomC = () => setCfgProd((p) => ({ ...p, bom: [...(p.bom || []), { material_id: "", material_name: "", qty_per_unit: 1, waste_per_order: 0, waste_per_unit: 0 }] }));
  const rmBomC = (i) => setCfgProd((p) => ({ ...p, bom: (p.bom || []).filter((_, idx) => idx !== i) }));
  const setCfgField = (k, v) => setCfgProd((p) => ({ ...p, config: { ...(p.config || {}), [k]: v } }));
  const setTurn2 = (id, patch) => setCfgProd((p) => ({ ...p, config: { ...p.config, turnarounds: (p.config.turnarounds || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) } }));
  const addTurn2 = () => setCfgProd((p) => ({ ...p, config: { ...p.config, turnarounds: [...(p.config.turnarounds || []), { id: `t${Date.now()}`, label: "", pct: 0 }] } }));
  const rmTurn2 = (id) => setCfgProd((p) => { const l = (p.config.turnarounds || []).filter((t) => t.id !== id); return { ...p, config: { ...p.config, turnarounds: l, default_turnaround: p.config.default_turnaround === id ? (l[0]?.id || "") : p.config.default_turnaround } }; });
  const toggleRel = (rid) => setCfgProd((p) => { const cur = p.config.related_ids || []; return { ...p, config: { ...p.config, related_ids: cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid] } }; });
  const regen = async () => {
    setRegenLoading(true);
    try {
      const c = cfgProd.config || {};
      const { data } = await api.post("/marketing/generate", { name: cfgProd.name, category: cfgProd.category, paper_class: c.paper_class || "", size: "", sides: c.sides || [], addons: c.addons || {}, turnarounds: c.turnarounds || [], tone: regenTone });
      setC({ marketing: data }); toast.success("Marketing regenerated");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); } finally { setRegenLoading(false); }
  };
  const saveConfig = async () => {
    try {
      if (!cfgProd.name || !cfgProd.name.trim()) return toast.error("Name required");
      const { id, your_price, dynamic_pricing, computed_cost, ...rest } = cfgProd;
      rest.price = Number(rest.price || 0); rest.wholesale_price = Number(rest.wholesale_price || 0);
      rest.bom = (rest.bom || []).filter((b) => b.material_id).map((b) => ({ ...b, qty_per_unit: Number(b.qty_per_unit || 0), waste_per_order: Number(b.waste_per_order || 0), waste_per_unit: Number(b.waste_per_unit || 0) }));
      let pid = id;
      if (id) await api.put(`/catalog-products/${id}`, rest);
      else { const res = await api.post("/catalog-products", rest); pid = res.data.id; }
      for (const rid of cfgRemovedVideoIds) { try { await api.delete(`/training/videos/${rid}`); } catch (e) {} }
      for (const v of cfgVideos) {
        if (!v.url || !v.url.trim()) continue;
        const body = { url: v.url.trim(), title_es: v.title_es, title_en: v.title_en || v.title_es, category: "product", ref_id: pid, ref_label: cfgProd.name };
        if (v.id) await api.put(`/training/videos/${v.id}`, body); else await api.post("/training/videos", body);
      }
      toast.success("Product saved"); setCfgProd(null); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const gt = (v) => (v && typeof v === "object" ? `EN: ${v.en || ""}\n\nES: ${v.es || ""}` : (v || ""));

  const load = () => api.get("/catalog-products").then(({ data }) => setItems(data));
  useEffect(() => {
    load();
    api.get("/config").then(({ data }) => setCats(data.product_categories || [])).catch(() => {});
    api.get("/materials").then(({ data }) => setMaterials(data)).catch(() => {});
  }, []);

  const openNew = () => {
    setCfgProd({ name: "", category: "Other", module: "", price: 0, wholesale_price: 0, description: "", published: false, product_type: "static", image_url: "",
      config: { turnarounds: [{ id: "standard", label: "Standard", pct: 0 }, { id: "next_day", label: "Next day", pct: 10 }, { id: "same_day", label: "Same day", pct: 15 }], default_turnaround: "standard" },
      bom: [], marketing: {} });
    setRegenTone("professional"); setCfgVideos([]); setCfgRemovedVideoIds([]);
  };
  const uploadImageC = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } }); setC({ image_url: data.url }); toast.success("Image uploaded"); }
    catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
  };
  const openEdit = (p) => {
    setForm({ name: p.name, category: p.category, module: p.module || "", price: p.price, wholesale_price: p.wholesale_price || 0, description: p.description || "", published: !!p.published, bom: (p.bom || []).map((b) => ({ waste_per_order: 0, waste_per_unit: 0, ...b })) });
    setEditId(p.id); setRemovedVideoIds([]); setOpen(true);
    api.get("/training/videos", { params: { category: "product", ref_id: p.id } })
      .then(({ data }) => setDlgVideos(data.map((v) => ({ id: v.id, url: v.url, title_es: v.title_es || "", title_en: v.title_en || "" }))))
      .catch(() => setDlgVideos([]));
  };
  const addBom = () => setForm((f) => ({ ...f, bom: [...f.bom, { material_id: "", material_name: "", qty_per_unit: 1, waste_per_order: 0, waste_per_unit: 0 }] }));
  const setBom = (i, k, v) => setForm((f) => {
    const bom = [...f.bom];
    bom[i] = { ...bom[i], [k]: v };
    if (k === "material_id") { const m = materials.find((x) => x.id === v); bom[i].material_name = m?.name || ""; }
    return { ...f, bom };
  });
  const onPickMaterial = async (i, v) => {
    setBom(i, "material_id", v);
    try {
      const { data } = await api.get(`/products/waste-suggestion`, { params: { material_id: v, category: form.category, module: form.module || "" } });
      if (data.samples > 0) {
        setForm((f) => { const bom = [...f.bom]; bom[i] = { ...bom[i], waste_per_order: data.waste_per_order, waste_per_unit: data.waste_per_unit }; return { ...f, bom }; });
        toast.info(`Suggested waste from ${data.samples} similar product(s)`);
      }
    } catch (e) { /* no suggestion */ }
  };
  const matCost = (id) => Number(materials.find((m) => m.id === id)?.unit_cost || 0);
  const bomUnitCost = form.bom.reduce((a, b) => a + matCost(b.material_id) * Number(b.qty_per_unit || 0), 0);
  const bomUnitCostC = (cfgProd?.bom || []).reduce((a, b) => a + matCost(b.material_id) * Number(b.qty_per_unit || 0), 0);
  const rmBom = (i) => setForm((f) => ({ ...f, bom: f.bom.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const payload = { ...form, price: Number(form.price || 0), wholesale_price: Number(form.wholesale_price || 0),
      bom: form.bom.filter((b) => b.material_id).map((b) => ({ ...b, qty_per_unit: Number(b.qty_per_unit || 0), waste_per_order: Number(b.waste_per_order || 0), waste_per_unit: Number(b.waste_per_unit || 0) })) };
    try {
      let pid = editId;
      if (editId) await api.put(`/catalog-products/${editId}`, payload);
      else { const res = await api.post("/catalog-products", payload); pid = res.data.id; }
      for (const rid of removedVideoIds) { try { await api.delete(`/training/videos/${rid}`); } catch (e) {} }
      for (const v of dlgVideos) {
        if (!v.url || !v.url.trim()) continue;
        const body = { url: v.url.trim(), title_es: v.title_es, title_en: v.title_en || v.title_es, category: "product", ref_id: pid, ref_label: form.name };
        if (v.id) await api.put(`/training/videos/${v.id}`, body);
        else await api.post("/training/videos", body);
      }
      toast.success("Product saved"); setOpen(false); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/catalog-products/${id}`); toast.success("Deleted"); load();
  };
  const togglePublish = async (p) => {
    await api.put(`/catalog-products/${p.id}`, { name: p.name, category: p.category, price: p.price, wholesale_price: p.wholesale_price || 0, description: p.description || "", published: !p.published, module: p.module, source_quote_id: p.source_quote_id, specs: p.specs || {}, bom: p.bom || [] });
    load();
  };

  const groups = {};
  items.forEach((p) => { (groups[p.category || "Other"] = groups[p.category || "Other"] || []).push(p); });
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
  const published = items.filter((p) => p.published).length;
  const belowCost = items.filter((p) => p.computed_cost != null && p.price - p.computed_cost < 0).length;

  return (
    <div data-testid="products-catalog-page">
      <PageHeader title="Product Catalog" eyebrow="Business Control"
        subtitle="Reusable products grouped by category (A-Z). Publish products for the future storefront.">
        <Button onClick={openNew} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="product-add-button">
          <Plus size={16} className="mr-1" /> New product
        </Button>
      </PageHeader>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Package} label="Products" value={items.length} />
          <Metric icon={CheckCircle2} label="Published" value={published} accent={published > 0} />
          <Metric icon={Eye} label="Categories" value={Object.keys(groups).length} />
          <Metric icon={AlertTriangle} label="Below cost" value={belowCost} accent={belowCost > 0} />
        </div>

        {items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400" data-testid="products-empty">
            No products yet. Convert a saved quote into a product from the Quotes page, or add one manually.
          </div>
        )}

        {Object.keys(groups).sort().map((cat) => (
          <div key={cat} data-testid="product-category-group" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 font-head font-bold flex items-center gap-2">
              {cat} <span className="text-xs font-normal text-slate-400">({groups[cat].length})</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {groups[cat].map((p) => (
                  <tr key={p.id} data-testid="product-row" className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${p.computed_cost != null && p.price - p.computed_cost < 0 ? "bg-red-50/60" : ""}`}>
                    <td className="px-5 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.name}
                        {p.published && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]" data-testid="product-published-badge">PUBLISHED</Badge>}
                        {p.computed_cost != null && p.price - p.computed_cost < 0 && <Badge className="bg-red-100 text-red-700 border-0 text-[10px]" data-testid="product-belowcost-badge">BELOW COST</Badge>}
                      </div>
                      {p.description && <div className="text-[11px] text-slate-400">{p.description}</div>}
                      {p.module && <div className="text-[10px] font-mono uppercase text-slate-400">{p.module}</div>}
                    </td>
                    <td className="px-5 py-3 text-right w-40">
                      <div className="num font-semibold text-[#2495D3]">{money(p.price)}</div>
                      {p.computed_cost != null ? (
                        <div className="text-[11px] num" data-testid="product-margin">
                          <span className="text-slate-400">cost {money(p.computed_cost)} · </span>
                          <span className={p.price - p.computed_cost < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                            {money(p.price - p.computed_cost)} ({p.price ? Math.round(((p.price - p.computed_cost) / p.price) * 100) : 0}%)
                          </span>
                        </div>
                      ) : <div className="text-[10px] text-slate-300">manual price</div>}
                    </td>
                    <td className="px-5 py-3 w-40">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1.5">
                          <Switch checked={!!p.published} onCheckedChange={() => togglePublish(p)} data-testid="product-publish-toggle" />
                          <span className="text-[10px] text-slate-400">Publish</span>
                        </div>
                        <TrainingVideoManager category="product" refId={p.id} refLabel={p.name} />
                        <button onClick={() => openConfig(p)} className="p-1.5 text-slate-400 hover:text-[#2495D3]" data-testid="product-edit"><Pencil size={15} /></button>
                        <button onClick={() => remove(p.id)} className="p-1.5 text-slate-400 hover:text-red-500" data-testid="product-delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">{editId ? "Edit" : "New"} product</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Category is editable — pick a suggestion or type your own.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div><Label className="text-xs">Name</Label>
              <Input data-testid="product-field-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Category</Label>
                <Input data-testid="product-field-category" list="product-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg mt-1" />
                <datalist id="product-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div><Label className="text-xs">Retail price ($)</Label>
                <Input data-testid="product-field-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded-lg mt-1" /></div>
            </div>
            <div><Label className="text-xs">Wholesale price ($) — resellers</Label>
              <Input data-testid="product-field-wholesale" type="number" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg mt-1" /></div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Materials used (deducted from inventory on sale)</Label>
                <Button type="button" size="sm" variant="outline" onClick={addBom} className="rounded-lg h-7" data-testid="bom-add">+ material</Button>
              </div>
              <div className="space-y-2">
                {form.bom.map((b, i) => (
                  <div key={i} className="space-y-1 border border-slate-100 rounded-lg p-2" data-testid="bom-row">
                    <div className="flex gap-2 items-center">
                      <Select value={b.material_id || ""} onValueChange={(v) => onPickMaterial(i, v)}>
                        <SelectTrigger className="rounded-lg h-8 text-xs flex-1" data-testid={`bom-material-${i}`}><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>
                          {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button onClick={() => rmBom(i)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400">Qty / unit</span>
                        <Input type="number" value={b.qty_per_unit} onChange={(e) => setBom(i, "qty_per_unit", e.target.value)} className="rounded-lg h-8 text-xs num" data-testid={`bom-qty-${i}`} />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Waste / order</span>
                        <Input type="number" step="0.1" value={b.waste_per_order} onChange={(e) => setBom(i, "waste_per_order", e.target.value)} className="rounded-lg h-8 text-xs num" data-testid={`bom-waste-order-${i}`} />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Waste / unit</span>
                        <Input type="number" step="0.01" value={b.waste_per_unit} onChange={(e) => setBom(i, "waste_per_unit", e.target.value)} className="rounded-lg h-8 text-xs num" data-testid={`bom-waste-unit-${i}`} />
                      </div>
                    </div>
                  </div>
                ))}
                {form.bom.length === 0 && <div className="text-[11px] text-slate-400">No materials linked — this product won't deduct inventory and uses the manual price above.</div>}
              </div>
              {form.bom.length > 0 && (
                <div className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" data-testid="bom-cost-preview">
                  Material cost / unit: <span className="num font-semibold">{money(bomUnitCost)}</span>
                  <span className="text-slate-400"> — retail & wholesale prices are auto-calculated from this cost + your markups on save (dynamic pricing).</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch data-testid="product-field-published" checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
              <Label className="text-xs">Published (visible in future storefront)</Label>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-semibold flex items-center gap-1"><Video size={13} /> Training videos</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg" data-testid="dlg-add-video" onClick={() => setDlgVideos((v) => [...v, { url: "", title_es: "", title_en: "" }])}>+ video</Button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">Paste a YouTube (unlisted) / Vimeo / Drive link and name it (e.g. "Add dry-erase lamination"). Add as many as you want — employees see them in the Training Center.</p>
              <div className="space-y-2">
                {dlgVideos.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center" data-testid="dlg-video-row">
                    <Input placeholder="Nombre / Name" value={v.title_es} onChange={(e) => setDlgVideos((list) => list.map((x, idx) => (idx === i ? { ...x, title_es: e.target.value } : x)))} className="rounded-lg h-8 text-xs w-44" data-testid={`dlg-video-title-${i}`} />
                    <Input placeholder="https://youtu.be/..." value={v.url} onChange={(e) => setDlgVideos((list) => list.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))} className="rounded-lg h-8 text-xs flex-1 num" data-testid={`dlg-video-url-${i}`} />
                    <button type="button" onClick={() => { setDlgVideos((list) => list.filter((_, idx) => idx !== i)); if (v.id) setRemovedVideoIds((r) => [...r, v.id]); }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  </div>
                ))}
                {dlgVideos.length === 0 && <p className="text-[11px] text-slate-400">No videos yet.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="product-save-button" onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cfgProd} onOpenChange={(v) => !v && setCfgProd(null)}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="config-product-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">{cfgProd?.id ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">One place for everything: pricing, materials, options, training videos & marketing.</DialogDescription>
          </DialogHeader>
          {cfgProd && (
            <div className="grid md:grid-cols-2 gap-5 py-1">
              <div className="space-y-3">
                <div><Label className="text-xs">Name</Label><Input value={cfgProd.name} onChange={(e) => setC({ name: e.target.value })} className="rounded-lg mt-1" data-testid="cfg-name" /></div>
                <div><Label className="text-xs">Category</Label><Input value={cfgProd.category} onChange={(e) => setC({ category: e.target.value })} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Description</Label><Textarea value={cfgProd.description || ""} onChange={(e) => setC({ description: e.target.value })} className="rounded-lg mt-1" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Retail price ($)</Label><Input type="number" value={cfgProd.price ?? 0} onChange={(e) => setC({ price: e.target.value })} className="rounded-lg mt-1 h-9 num" data-testid="cfg-price" /></div>
                  <div><Label className="text-xs">Wholesale ($)</Label><Input type="number" value={cfgProd.wholesale_price ?? 0} onChange={(e) => setC({ wholesale_price: e.target.value })} className="rounded-lg mt-1 h-9 num" data-testid="cfg-wholesale" /></div>
                </div>
                <div>
                  <Label className="text-xs">Product image</Label>
                  <input type="file" accept="image/*" onChange={uploadImageC} className="text-[11px] mt-1 block w-full" data-testid="cfg-image-upload" />
                  {cfgProd.image_url && <img src={`${API}${cfgProd.image_url}?auth=${localStorage.getItem("pns_token")}`} alt="preview" className="mt-1 h-14 rounded object-cover" />}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-1"><Label className="text-xs font-semibold">Materials (auto-pricing)</Label>
                    <button type="button" onClick={addBomC} className="text-[11px] text-[#2495D3] hover:underline" data-testid="cfg-bom-add">+ material</button></div>
                  {(cfgProd.bom || []).map((b, i) => (
                    <div key={i} className="flex items-center gap-1.5 mb-1.5" data-testid="cfg-bom-row">
                      <Select value={b.material_id || ""} onValueChange={(v) => setBomC(i, "material_id", v)}>
                        <SelectTrigger className="rounded-lg h-8 text-xs flex-1"><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" value={b.qty_per_unit} onChange={(e) => setBomC(i, "qty_per_unit", e.target.value)} className="rounded-lg h-8 text-xs w-16 num" title="Qty per unit" />
                      <button type="button" onClick={() => rmBomC(i)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {(cfgProd.bom || []).length > 0 && <div className="text-[11px] text-slate-500 mt-1">Material cost/unit: <b className="num">{money(bomUnitCostC)}</b> — retail & wholesale auto-calc from your markups on save.</div>}
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <Label className="text-xs font-semibold">Add-ons offered</Label>
                  {["lamination", "hot_foil", "round_corners"].map((k) => (
                    <div key={k} className="flex items-center justify-between"><span className="text-xs capitalize">{k.replace("_", " ")}</span>
                      <Switch checked={!!(cfgProd.config?.addons || {})[k]} onCheckedChange={(v) => setCfgField("addons", { ...(cfgProd.config?.addons || {}), [k]: v })} data-testid={`cfg-addon-${k}`} /></div>
                  ))}
                </div>
                <div><Label className="text-xs">File setup fee ($)</Label><Input type="number" value={cfgProd.config?.file_handling?.fee ?? 0} onChange={(e) => setCfgField("file_handling", { fee: Number(e.target.value) || 0 })} className="rounded-lg mt-1 h-9 num" data-testid="cfg-fee" /></div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Turnarounds</Label>
                    <button type="button" onClick={addTurn2} className="text-[11px] text-[#2495D3] hover:underline">+ Add</button></div>
                  {(cfgProd.config?.turnarounds || []).map((t) => (
                    <div key={t.id} className="flex items-center gap-1.5" data-testid="cfg-turn-row">
                      <button type="button" onClick={() => setCfgField("default_turnaround", t.id)} className={`text-[9px] rounded px-1 py-1 border shrink-0 ${cfgProd.config.default_turnaround === t.id ? "bg-emerald-500 text-white border-emerald-500" : "border-slate-300 text-slate-500"}`}>Def</button>
                      <Input value={t.label} onChange={(e) => setTurn2(t.id, { label: e.target.value })} className="rounded-lg h-8 text-xs flex-1" />
                      <Input type="number" value={t.pct} onChange={(e) => setTurn2(t.id, { pct: Number(e.target.value) || 0 })} className="rounded-lg h-8 text-xs w-14 num" />
                      <button type="button" onClick={() => rmTurn2(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <Label className="text-xs font-semibold">Related products</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {items.filter((x) => x.id !== cfgProd.id).map((x) => (
                      <button key={x.id} type="button" onClick={() => toggleRel(x.id)} className={`text-[11px] rounded-full px-2 py-0.5 border ${(cfgProd.config?.related_ids || []).includes(x.id) ? "bg-[#2495D3] text-white border-[#2495D3]" : "border-slate-300 text-slate-600"}`}>{x.name}</button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold flex items-center gap-1"><Video size={13} /> Training videos</Label>
                    <button type="button" onClick={() => setCfgVideos((v) => [...v, { url: "", title_es: "", title_en: "" }])} className="text-[11px] text-[#2495D3] hover:underline" data-testid="cfg-add-video">+ Add</button>
                  </div>
                  {cfgVideos.map((v, i) => (
                    <div key={i} className="flex items-center gap-1.5 mb-1.5" data-testid="cfg-video-row">
                      <Input value={v.title_es} onChange={(e) => setCfgVideos((l) => l.map((x, idx) => (idx === i ? { ...x, title_es: e.target.value } : x)))} placeholder="Nombre / Name" className="rounded-lg h-8 text-xs w-32" data-testid={`cfg-video-title-${i}`} />
                      <Input value={v.url} onChange={(e) => setCfgVideos((l) => l.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))} placeholder="https://youtu.be/..." className="rounded-lg h-8 text-xs flex-1 num" data-testid={`cfg-video-url-${i}`} />
                      <button type="button" onClick={() => { setCfgVideos((l) => l.filter((_, idx) => idx !== i)); if (v.id) setCfgRemovedVideoIds((r) => [...r, v.id]); }} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {cfgVideos.length === 0 && <p className="text-[11px] text-slate-400 mt-1">No videos yet.</p>}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Marketing content</Label>
                  <div className="flex items-center gap-1.5">
                    <select value={regenTone} onChange={(e) => setRegenTone(e.target.value)} className="text-[11px] border border-slate-300 rounded px-1 py-0.5" data-testid="cfg-tone">
                      {["professional", "friendly", "playful", "luxury", "bold"].map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <button type="button" onClick={regen} disabled={regenLoading} className="text-[11px] text-[#2495D3] hover:underline inline-flex items-center gap-1 disabled:opacity-50" data-testid="cfg-regen"><Sparkles size={12} /> {regenLoading ? "…" : "Regenerate"}</button>
                  </div>
                </div>
                {[["SEO title", gt(cfgProd.marketing?.seo_title)], ["SEO description", gt(cfgProd.marketing?.seo_description)], ["Slug", cfgProd.marketing?.slug], ["Hashtags", (cfgProd.marketing?.hashtags || []).join(" ")], ["Short description", gt(cfgProd.marketing?.short_description)], ["Long description", gt(cfgProd.marketing?.long_description)], ["Instagram", gt(cfgProd.marketing?.instagram)], ["Facebook", gt(cfgProd.marketing?.facebook)], ["Kijiji", cfgProd.marketing?.kijiji ? `EN: ${cfgProd.marketing.kijiji.en?.title || ""}\n${cfgProd.marketing.kijiji.en?.body || ""}\n\nES: ${cfgProd.marketing.kijiji.es?.title || ""}\n${cfgProd.marketing.kijiji.es?.body || ""}` : ""], ["Image alt", gt(cfgProd.marketing?.image_alt)]].map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-2" data-testid="mk-field">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{label}</span>
                      <button type="button" onClick={() => copy(val)} className="text-slate-400 hover:text-[#2495D3]" data-testid="mk-copy"><Copy size={13} /></button>
                    </div>
                    <div className="text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-4">{val || <span className="text-slate-300">— generate to fill —</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <div className="flex items-center gap-3 mr-auto"><Switch checked={!!cfgProd?.published} onCheckedChange={(v) => setC({ published: v })} data-testid="cfg-published" /><Label className="text-xs">Published</Label></div>
            <Button variant="outline" onClick={() => setCfgProd(null)} className="rounded-lg">Cancel</Button>
            <Button onClick={saveConfig} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="cfg-save">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
