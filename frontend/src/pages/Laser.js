import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import SizesEditor from "@/components/SizesEditor";
import NestingCanvas from "@/components/NestingCanvas";
import { CostRow } from "@/components/Totals";
import { Metric, EmptyState, SectionLabel, priceOf, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { useRequote } from "@/lib/useRequote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Save, FileStack, Hash, Tag } from "lucide-react";

const matFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "sheet_width", label: "Sheet Width (in)", type: "number", default: 24 },
  { name: "sheet_height", label: "Sheet Height (in)", type: "number", default: 18 },
  { name: "cost_per_sheet", label: "Cost / sheet (CAD)", type: "number", default: 8 },
  { name: "linked_material_id", label: "Link to Materials DB (cost from purchases)", type: "material-link", full: true },
];
const matCols = [
  { name: "name", label: "Material" },
  { name: "sheet_width", label: "Sheet", mono: true, render: (i) => `${i.sheet_width}×${i.sheet_height}"` },
  { name: "cost_per_sheet", label: "Cost/sheet", mono: true, render: (i) => money(i.cost_per_sheet) },
  { name: "linked", label: "Linked", render: (i) => i.linked_material_name || "—" },
];

export default function Laser() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sizes, setSizes] = useState([{ label: "Piece", w: 6, h: 6, qty: 10 }]);
  const [cfg, setCfg] = useState({ material: "", power: 100, speed: 100, time_min: 0, thickness: 0.125, passes: 1, cut_length_in: 24, engrave_area_sqin: 4 });
  const [presets, setPresets] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);
  const set = (k, v) => setCfg((p) => ({ ...p, [k]: v }));

  const loadPresets = () => api.get("/laser-presets").then((r) => setPresets(r.data));
  useEffect(() => { loadPresets(); }, []);

  const applyPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setCfg({ material: p.material, power: p.power, speed: p.speed, time_min: p.time_min, thickness: p.thickness, passes: p.passes, cut_length_in: cfg.cut_length_in, engrave_area_sqin: cfg.engrave_area_sqin });
    if (p.sizes?.length) setSizes(p.sizes.map((s) => ({ label: s.label || "", w: s.w, h: s.h, qty: s.qty || 1 })));
  };
  const savePreset = async () => {
    try {
      await api.post("/laser-presets", {
        name: presetName || "Laser preset", material: cfg.material, power: +cfg.power, speed: +cfg.speed,
        time_min: +cfg.time_min, thickness: +cfg.thickness, passes: +cfg.passes,
        sizes: sizes.map((s) => ({ label: s.label || "", w: +s.w, h: +s.h, qty: +s.qty || 1 })),
      });
      toast.success("Laser preset saved"); setSaveOpen(false); setPresetName(""); loadPresets();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const calc = async () => {
    try {
      const body = {
        sizes: sizes.map((s) => ({ label: s.label, w: +s.w, h: +s.h, qty: +s.qty })),
        cut_length_in: +cfg.cut_length_in, engrave_area_sqin: +cfg.engrave_area_sqin,
      };
      const { data } = await api.post("/calc/laser", body);
      if (!data.results.length) toast.info("Add laser materials first.");
      setRes(data);
      setSel(data.results[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="laser-page">
      <PageHeader title="Laser Products" eyebrow="Live Pricing" subtitle="Material + cut + engraving · save machine presets" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-laser-materials" className="rounded-full">Materials</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-head font-bold">Pieces</h3>
                <div className="flex gap-2">
                  <Select onValueChange={applyPreset}>
                    <SelectTrigger data-testid="laser-preset-load" className="rounded-lg h-9 w-40 text-xs"><SelectValue placeholder="Load preset" /></SelectTrigger>
                    <SelectContent>
                      {presets.length === 0 ? <SelectItem value="none" disabled>No presets</SelectItem> : presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button data-testid="laser-preset-save" onClick={() => setSaveOpen(true)} size="sm" variant="outline" className="rounded-lg"><Save size={14} /></Button>
                </div>
              </div>
              <SizesEditor sizes={sizes} setSizes={setSizes} module="laser" />
              <div className="grid grid-cols-3 gap-3 mt-5">
                <div><Label className="text-xs">Material</Label><Input data-testid="laser-material" value={cfg.material} onChange={(e) => set("material", e.target.value)} className="rounded-lg mt-1" /></div>
                <div><Label className="text-xs">Power %</Label><Input type="number" value={cfg.power} onChange={(e) => set("power", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Speed</Label><Input type="number" value={cfg.speed} onChange={(e) => set("speed", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Thickness (in)</Label><Input type="number" value={cfg.thickness} onChange={(e) => set("thickness", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Passes</Label><Input type="number" value={cfg.passes} onChange={(e) => set("passes", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Time (min)</Label><Input type="number" value={cfg.time_min} onChange={(e) => set("time_min", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Cut length (in)</Label><Input data-testid="laser-cut" type="number" value={cfg.cut_length_in} onChange={(e) => set("cut_length_in", e.target.value)} className="rounded-lg mt-1 num" /></div>
                <div><Label className="text-xs">Engrave (in²)</Label><Input data-testid="laser-engrave" type="number" value={cfg.engrave_area_sqin} onChange={(e) => set("engrave_area_sqin", e.target.value)} className="rounded-lg mt-1 num" /></div>
              </div>
              <Button data-testid="calc-laser-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />Compare Materials
              </Button>
            </div>
            <div className="lg:col-span-6">
              {!res || !sel ? (
                <EmptyState>Enter pieces and compare materials.</EmptyState>
              ) : (
                <div className="space-y-6" data-testid="laser-results">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Metric icon={FileStack} label="Sheets" value={sel.sheets} />
                    <Metric icon={Hash} label="Pieces" value={sel.quantity} />
                    {priceOf(sel) != null && <Metric icon={Tag} label={sel.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(sel))} accent />}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <SectionLabel>{sel.material.name} · Layout</SectionLabel>
                    {sel.layout && <NestingCanvas layout={sel.layout} />}
                    <div className="mt-3">
                      <CostRow label="Material" value={sel.sheet_cost} />
                      <CostRow label="Cut" value={sel.cut_cost} />
                      <CostRow label="Engrave" value={sel.engrave_cost} />
                      <CostRow label="Setup" value={sel.setup} />
                    </div>
                    <PricingPanel r={sel} className="mt-3" />
                    <div className="mt-3 flex justify-end"><SaveQuoteBar module="Laser" title={`Laser ${sel.material.name}`} inputs={{ sizes, cfg }} summary={sel} /></div>
                  </div>
                  <div>
                    <SectionLabel>Compare Materials</SectionLabel>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {res.results.map((r, idx) => {
                        const isSel = sel.material.id === r.material.id;
                        return (
                          <button key={r.material.id} data-testid="laser-compare-row" onClick={() => setSel(r)}
                            className={`text-left rounded-xl border p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                            <div className="flex items-center justify-between">
                              <div className="font-head font-bold text-sm">{r.material.name}</div>
                              {idx === 0 && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best</span>}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{r.sheets} sheet(s)</div>
                            <div className="num text-xl font-black text-[#2495D3] mt-2">{money(priceOf(r))}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          {isAdmin && (
            <TabsContent value="materials" className="mt-6">
              <CrudManager endpoint="laser-materials" fields={matFields} columns={matCols} prefix="laser-material" />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader><DialogTitle className="font-head">Save laser preset</DialogTitle></DialogHeader>
          <Label className="text-xs">Preset name</Label>
          <Input data-testid="laser-preset-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} className="rounded-lg" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="laser-preset-confirm" onClick={savePreset} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
