import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, CheckCircle2, Eye } from "lucide-react";

const BLANK = { name: "", category: "Other", price: 0, description: "", published: false };

export default function ProductsCatalog() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/catalog-products").then(({ data }) => setItems(data));
  useEffect(() => {
    load();
    api.get("/config").then(({ data }) => setCats(data.product_categories || [])).catch(() => {});
  }, []);

  const openNew = () => { setForm(BLANK); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({ name: p.name, category: p.category, price: p.price, description: p.description || "", published: !!p.published });
    setEditId(p.id); setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const payload = { ...form, price: Number(form.price || 0) };
    try {
      if (editId) await api.put(`/catalog-products/${editId}`, payload);
      else await api.post("/catalog-products", payload);
      toast.success("Product saved"); setOpen(false); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/catalog-products/${id}`); toast.success("Deleted"); load();
  };
  const togglePublish = async (p) => {
    await api.put(`/catalog-products/${p.id}`, { name: p.name, category: p.category, price: p.price, description: p.description || "", published: !p.published, module: p.module, source_quote_id: p.source_quote_id, specs: p.specs || {} });
    load();
  };

  const groups = {};
  items.forEach((p) => { (groups[p.category || "Other"] = groups[p.category || "Other"] || []).push(p); });
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
  const published = items.filter((p) => p.published).length;

  return (
    <div data-testid="products-catalog-page">
      <PageHeader title="Product Catalog" eyebrow="Business Control"
        subtitle="Reusable products grouped by category (A-Z). Publish products for the future storefront.">
        <Button onClick={openNew} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="product-add-button">
          <Plus size={16} className="mr-1" /> New product
        </Button>
      </PageHeader>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric icon={Package} label="Products" value={items.length} />
          <Metric icon={CheckCircle2} label="Published" value={published} accent={published > 0} />
          <Metric icon={Eye} label="Categories" value={Object.keys(groups).length} />
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
                  <tr key={p.id} data-testid="product-row" className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.name}
                        {p.published && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]" data-testid="product-published-badge">PUBLISHED</Badge>}
                      </div>
                      {p.description && <div className="text-[11px] text-slate-400">{p.description}</div>}
                      {p.module && <div className="text-[10px] font-mono uppercase text-slate-400">{p.module}</div>}
                    </td>
                    <td className="px-5 py-3 text-right num font-semibold text-[#2495D3] w-28">{money(p.price)}</td>
                    <td className="px-5 py-3 w-40">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1.5">
                          <Switch checked={!!p.published} onCheckedChange={() => togglePublish(p)} data-testid="product-publish-toggle" />
                          <span className="text-[10px] text-slate-400">Publish</span>
                        </div>
                        <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-[#2495D3]" data-testid="product-edit"><Pencil size={15} /></button>
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
              <div><Label className="text-xs">Price ($)</Label>
                <Input data-testid="product-field-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded-lg mt-1" /></div>
            </div>
            <div><Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg mt-1" /></div>
            <div className="flex items-center gap-3">
              <Switch data-testid="product-field-published" checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
              <Label className="text-xs">Published (visible in future storefront)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="product-save-button" onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
