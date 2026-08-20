import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

// fields: [{name,label,type:'text'|'number'|'switch'|'select',options?}]
export default function CrudManager({ endpoint, fields, columns, prefix, onChange, readOnly, sortFn }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const hasLink = fields.some((f) => f.type === "material-link");

  useEffect(() => {
    if (hasLink) api.get("/materials").then(({ data }) => setMaterials(data)).catch(() => {});
  }, [hasLink]);

  const blank = () => {
    const o = {};
    fields.forEach((f) => (o[f.name] = f.type === "switch" ? false : f.default ?? (f.type === "number" ? 0 : "")));
    return o;
  };

  const load = async () => {
    const { data } = await api.get(`/${endpoint}`);
    setItems(data);
    onChange && onChange(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [endpoint]);

  const openNew = () => { setForm(blank()); setEditId(null); setOpen(true); };
  const openEdit = (it) => { setForm({ ...it }); setEditId(it.id); setOpen(true); };

  const save = async () => {
    try {
      const payload = {};
      fields.forEach((f) => {
        let v = form[f.name];
        if (f.type === "number") v = v === "" || v == null ? 0 : Number(v);
        if (f.type === "material-link") v = !v || v === "none" ? null : v;
        payload[f.name] = v;
      });
      if (editId) await api.put(`/${endpoint}/${editId}`, payload);
      else await api.post(`/${endpoint}`, payload);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiErr(e.response?.data?.detail) || e.message);
    }
  };

  const remove = async (id) => {
    await api.delete(`/${endpoint}/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
          {items.length} records
        </span>
        {readOnly ? (
          <a href="/materials" data-testid={`${prefix}-manage-link`} className="text-xs font-medium text-[#2495D3] hover:underline">
            Manage in Materials →
          </a>
        ) : (
          <Button data-testid={`${prefix}-add-button`} onClick={openNew} size="sm" className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Plus size={15} className="mr-1" /> Add
          </Button>
        )}
      </div>
      {readOnly && (
        <div className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2" data-testid={`${prefix}-readonly-note`}>
          Reference only. Materials are created and edited centrally in the <a href="/materials" className="text-[#2495D3] hover:underline">Materials</a> page and assigned to this module.
        </div>
      )}
      <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((c) => (
                <th key={c.name} className="text-left px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-widest text-slate-500">
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {(sortFn ? [...items].sort(sortFn) : items).map((it) => (
              <tr key={it.id} data-testid={`${prefix}-row`} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.name} className={`px-4 py-2.5 ${c.mono ? "num tabular" : ""}`}>
                    {c.render ? c.render(it) : String(it[c.name] ?? "")}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button data-testid={`${prefix}-edit`} onClick={() => openEdit(it)} className="p-1.5 text-slate-400 hover:text-[#2495D3]">
                        <Pencil size={15} />
                      </button>
                      <button data-testid={`${prefix}-delete`} onClick={() => remove(it.id)} className="p-1.5 text-slate-400 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400 text-sm">No records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm" data-testid={`${prefix}-dialog`}>
          <DialogHeader><DialogTitle className="font-head">{editId ? "Edit" : "New"} record</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? "col-span-2" : ""}>
                <Label className="text-xs">{f.label}</Label>
                {f.type === "switch" ? (
                  <div className="mt-2">
                    <Switch data-testid={`${prefix}-field-${f.name}`} checked={!!form[f.name]} onCheckedChange={(v) => setForm({ ...form, [f.name]: v })} />
                  </div>
                ) : f.type === "select" ? (
                  <Select value={String(form[f.name] ?? "")} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger data-testid={`${prefix}-field-${f.name}`} className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === "material-link" ? (
                  <Select value={form[f.name] || "none"} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger data-testid={`${prefix}-field-${f.name}`} className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked (manual cost)</SelectItem>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}{m.unit_cost != null ? ` — $${m.unit_cost}/${m.unit || "unit"}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input data-testid={`${prefix}-field-${f.name}`} type={f.type} value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} className="rounded-sm mt-1" />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancel</Button>
            <Button data-testid={`${prefix}-save-button`} onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
