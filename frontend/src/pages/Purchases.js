import { useEffect, useState, useRef } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, Receipt, Landmark, Loader2 } from "lucide-react";

const CATEGORIES = ["sheet", "roll", "ink", "laminate", "substrate", "other"];
const MODULES = [
  "paper", "booklet", "large-format", "stickers", "dtf", "embroidery",
  "laser", "direct-print", "channel-letters", "sublimation", "roll-stickers",
];

export default function Purchases() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ supplier: "", date_from: "", date_to: "" });
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    const params = {};
    if (filters.supplier) params.supplier = filters.supplier;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    const { data } = await api.get("/purchases", { params });
    setItems(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  const openImport = () => { setDraft(null); setOpen(true); };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/purchases/parse", fd);
      setDraft({
        ...data,
        default_category: data.suggested_category || "other",
        modules: data.suggested_modules || [],
        update_inventory: true,
      });
      toast.success("Invoice parsed — review and save");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const setD = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setSup = (k, v) => setDraft((d) => ({ ...d, supplier: { ...d.supplier, [k]: v } }));
  const setLine = (i, k, v) => setDraft((d) => {
    const li = [...d.line_items]; li[i] = { ...li[i], [k]: v }; return { ...d, line_items: li };
  });
  const toggleModule = (m) => setDraft((d) => ({
    ...d, modules: d.modules.includes(m) ? d.modules.filter((x) => x !== m) : [...d.modules, m],
  }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        supplier: draft.supplier,
        invoice_number: draft.invoice_number || "",
        date: draft.date || "",
        po_number: draft.po_number || "",
        currency: draft.currency || "CAD",
        subtotal: Number(draft.subtotal || 0),
        gst: Number(draft.gst || 0),
        pst: Number(draft.pst || 0),
        shipping: Number(draft.shipping || 0),
        total: Number(draft.total || 0),
        default_category: draft.default_category,
        modules: draft.modules,
        update_inventory: draft.update_inventory,
        line_items: draft.line_items.map((li) => ({
          code: li.code || "", description: li.description || "", name: li.name || "",
          quantity: Number(li.quantity || 0), unit: li.unit || "",
          unit_price: Number(li.unit_price || 0), line_total: Number(li.line_total || 0),
          import_material: !!li.import,
        })),
      };
      const { data } = await api.post("/purchases", payload);
      const aff = data.materials_affected || [];
      const created = aff.filter((a) => a.action === "created").length;
      const updated = aff.filter((a) => a.action === "updated").length;
      toast.success(`Purchase saved · ${created} materials created, ${updated} updated`);
      setOpen(false);
      load();
    } catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this purchase record?")) return;
    await api.delete(`/purchases/${id}`);
    toast.success("Deleted");
    load();
  };

  const exportCsv = async () => {
    const params = {};
    if (filters.supplier) params.supplier = filters.supplier;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    const res = await api.get("/purchases/export.csv", { params, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url; a.download = "purchases.csv"; a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalSpend = items.reduce((a, p) => a + (p.total || 0), 0);
  const totalGst = items.reduce((a, p) => a + (p.gst || 0), 0);
  const totalPst = items.reduce((a, p) => a + (p.pst || 0), 0);

  return (
    <div data-testid="purchases-page">
      <PageHeader title="Purchases" eyebrow="Business Control"
        subtitle="Import supplier invoices from PDF — auto-fill materials & inventory and keep a tax-ready history.">
        <Button variant="outline" onClick={exportCsv} data-testid="purchases-export-button" className="rounded-lg">
          <Download size={15} className="mr-1" /> Export CSV
        </Button>
        <Button onClick={openImport} data-testid="purchase-import-button" className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
          <Upload size={16} className="mr-1" /> Import from PDF
        </Button>
      </PageHeader>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Receipt} label="Purchases" value={items.length} />
          <Metric icon={Landmark} label="Total spend" value={money(totalSpend)} accent />
          <Metric icon={Landmark} label="GST paid" value={money(totalGst)} />
          <Metric icon={Landmark} label="PST paid" value={money(totalPst)} />
        </div>

        <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4">
          <div><Label className="text-xs">Supplier</Label>
            <Input data-testid="purchases-filter-supplier" value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })} className="rounded-lg mt-1 w-48" placeholder="e.g. Alfa" /></div>
          <div><Label className="text-xs">From</Label>
            <Input type="date" data-testid="purchases-filter-from" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="rounded-lg mt-1" /></div>
          <div><Label className="text-xs">To</Label>
            <Input type="date" data-testid="purchases-filter-to" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="rounded-lg mt-1" /></div>
          {(filters.supplier || filters.date_from || filters.date_to) && (
            <Button variant="ghost" onClick={() => setFilters({ supplier: "", date_from: "", date_to: "" })} className="rounded-lg text-slate-500">Clear</Button>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-left px-4 py-2.5">Invoice #</th>
                <th className="text-right px-4 py-2.5">Subtotal</th>
                <th className="text-right px-4 py-2.5">GST</th>
                <th className="text-right px-4 py-2.5">PST</th>
                <th className="text-right px-4 py-2.5">Shipping</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid="purchase-row" className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 num">{p.date}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.supplier?.company}</div>
                    <div className="text-[11px] text-slate-400">{(p.materials_affected || []).length} materials</div>
                  </td>
                  <td className="px-4 py-2.5 num text-slate-500">{p.invoice_number}</td>
                  <td className="px-4 py-2.5 text-right num">{money(p.subtotal)}</td>
                  <td className="px-4 py-2.5 text-right num">{money(p.gst)}</td>
                  <td className="px-4 py-2.5 text-right num">{money(p.pst)}</td>
                  <td className="px-4 py-2.5 text-right num">{money(p.shipping)}</td>
                  <td className="px-4 py-2.5 text-right num font-semibold text-[#2495D3]">{money(p.total)}</td>
                  <td className="px-4 py-2.5">
                    <button data-testid="purchase-delete" onClick={() => remove(p.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No purchases yet. Import an invoice PDF to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="purchase-import-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Import purchase from PDF</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Upload a supplier invoice — we read it automatically. Review before saving.</DialogDescription>
          </DialogHeader>

          {!draft ? (
            <div className="py-8">
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-xl p-12 cursor-pointer hover:border-[#2495D3] transition-colors" data-testid="purchase-dropzone">
                {uploading ? <Loader2 className="animate-spin text-[#2495D3]" size={32} /> : <FileText className="text-slate-400" size={32} />}
                <span className="text-sm text-slate-500">{uploading ? "Reading invoice…" : "Click to choose a PDF invoice"}</span>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" data-testid="purchase-file-input" onChange={onFile} disabled={uploading} />
              </label>
            </div>
          ) : (
            <div className="space-y-5 py-1">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label className="text-xs">Supplier</Label>
                  <Input data-testid="draft-supplier-company" value={draft.supplier?.company || ""} onChange={(e) => setSup("company", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Invoice #</Label>
                  <Input data-testid="draft-invoice" value={draft.invoice_number || ""} onChange={(e) => setD("invoice_number", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Date</Label>
                  <Input type="date" data-testid="draft-date" value={draft.date || ""} onChange={(e) => setD("date", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Supplier email</Label>
                  <Input value={draft.supplier?.email || ""} onChange={(e) => setSup("email", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Category (new materials)</Label>
                  <Select value={draft.default_category} onValueChange={(v) => setD("default_category", v)}>
                    <SelectTrigger data-testid="draft-category" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Assign to modules</div>
                <div className="flex flex-wrap gap-2">
                  {MODULES.map((m) => (
                    <button key={m} type="button" data-testid={`draft-module-${m}`} onClick={() => toggleModule(m)}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${draft.modules.includes(m) ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                      <th className="text-center px-2 py-2">Import</th>
                      <th className="text-left px-2 py-2">Name</th>
                      <th className="text-left px-2 py-2">Code</th>
                      <th className="text-right px-2 py-2">Qty</th>
                      <th className="text-right px-2 py-2">Unit cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.line_items.map((li, i) => (
                      <tr key={i} data-testid="draft-line-row" className="border-b border-slate-100">
                        <td className="px-2 py-1.5 text-center">
                          <Switch data-testid={`draft-line-import-${i}`} checked={!!li.import} onCheckedChange={(v) => setLine(i, "import", v)} />
                        </td>
                        <td className="px-2 py-1.5"><Input value={li.name || ""} onChange={(e) => setLine(i, "name", e.target.value)} className="rounded h-7 text-xs" /></td>
                        <td className="px-2 py-1.5"><Input value={li.code || ""} onChange={(e) => setLine(i, "code", e.target.value)} className="rounded h-7 text-xs w-28" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={li.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} className="rounded h-7 text-xs w-16 text-right num" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={li.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} className="rounded h-7 text-xs w-20 text-right num" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {["subtotal", "gst", "pst", "shipping", "total"].map((k) => (
                  <div key={k}><Label className="text-xs capitalize">{k}</Label>
                    <Input type="number" data-testid={`draft-${k}`} value={draft[k] ?? 0} onChange={(e) => setD(k, e.target.value)} className="rounded-lg mt-1 num" /></div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Switch data-testid="draft-update-inventory" checked={!!draft.update_inventory} onCheckedChange={(v) => setD("update_inventory", v)} />
                <Label className="text-xs">Update materials & inventory (match by code, add qty to stock, create new if missing)</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            {draft && (
              <Button data-testid="purchase-save-button" onClick={save} disabled={saving} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
                {saving ? "Saving…" : "Save purchase"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
