import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, X, Save } from "lucide-react";

// Reusable multi-size editor with per-user presets. Columns: label, w, h, qty.
export default function SizesEditor({ sizes, setSizes, module, max = 25, cols = ["label", "w", "h", "qty"] }) {
  const [presets, setPresets] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const load = () => api.get("/job-presets").then((r) => setPresets(r.data.filter((p) => p.module === module)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [module]);

  const add = () => sizes.length < max && setSizes([...sizes, { label: "", w: 12, h: 12, qty: 1 }]);
  const rm = (i) => setSizes(sizes.filter((_, idx) => idx !== i));
  const upd = (i, k, v) => setSizes(sizes.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));

  const loadPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (p) setSizes(p.sizes.map((s) => ({ label: s.label || "", w: s.w, h: s.h, qty: s.qty || 1 })));
  };
  const savePreset = async () => {
    try {
      await api.post("/job-presets", {
        name: presetName || "Preset", module,
        sizes: sizes.map((s) => ({ label: s.label || "", w: +s.w, h: +s.h, qty: +s.qty || 1 })),
      });
      toast.success("Preset saved");
      setSaveOpen(false); setPresetName(""); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const labels = { label: "Label", w: "Width in", h: "Height in", qty: "Qty" };
  const spans = { label: "col-span-4", w: "col-span-3", h: "col-span-3", qty: "col-span-2" };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">{sizes.length}/{max} sizes</span>
        <div className="flex gap-2">
          <Select onValueChange={loadPreset}>
            <SelectTrigger data-testid="preset-load" className="rounded-sm h-9 w-40 text-xs"><SelectValue placeholder="Load preset" /></SelectTrigger>
            <SelectContent>
              {presets.length === 0 ? <SelectItem value="none" disabled>No presets</SelectItem> :
                presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button data-testid="preset-save-open" onClick={() => setSaveOpen(true)} size="sm" variant="outline" className="rounded-sm"><Save size={14} /></Button>
          <Button data-testid="add-size-row" onClick={add} size="sm" variant="outline" className="rounded-sm"><Plus size={15} /></Button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2 text-[10px] font-mono uppercase text-slate-500 px-1 mb-1">
        {cols.map((c) => <span key={c} className={spans[c]}>{labels[c]}</span>)}
        <span className="col-span-1" />
      </div>
      <div className="space-y-2">
        {sizes.map((s, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`size-row-${i}`}>
            {cols.map((c) => (
              <Input key={c} className={`${spans[c]} rounded-sm ${c !== "label" ? "num" : ""}`}
                type={c === "label" ? "text" : "number"} placeholder={c === "label" ? "e.g. Front" : ""}
                value={s[c] ?? ""} onChange={(e) => upd(i, c, e.target.value)} />
            ))}
            <button className="col-span-1 text-slate-400 hover:text-red-500" onClick={() => rm(i)}><X size={16} /></button>
          </div>
        ))}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-head">Save size preset</DialogTitle></DialogHeader>
          <Label className="text-xs">Preset name</Label>
          <Input data-testid="preset-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} className="rounded-sm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} className="rounded-sm">Cancel</Button>
            <Button data-testid="preset-save-confirm" onClick={savePreset} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
