import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import NestingCanvas from "@/components/NestingCanvas";
import { Metric, EmptyState, SectionLabel, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { InkPicker } from "@/components/InkPicker";
import { useRequote } from "@/lib/useRequote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { Plus, X, Calculator, Layers, Ruler, Tag, DollarSign } from "lucide-react";

const MODES = [
  { v: "print", l: "Print Only" },
  { v: "print_lam", l: "Print + Lamination" },
  { v: "print_diecut", l: "Print + Die-Cut + Transfer Tape" },
];

const matFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "code", label: "Code", type: "text" },
  { name: "material_type", label: "Type", type: "select", options: ["vinyl", "banner", "specialty", "paper"], default: "vinyl" },
  { name: "roll_width", label: "Roll Width (in)", type: "number", default: 54 },
  { name: "printable_width", label: "Printable Width (in)", type: "number", default: 52 },
  { name: "price_per_sqft", label: "Price / sqft (CAD)", type: "number", default: 0.85 },
  { name: "min_linear_feet", label: "Min Linear Feet", type: "number", default: 1 },
  { name: "sticker_compatible", label: "Sticker Compatible", type: "switch" },
];
const matCols = [
  { name: "name", label: "Name" },
  { name: "code", label: "Code", mono: true },
  { name: "material_type", label: "Type" },
  { name: "printable_width", label: "Printable", mono: true, render: (i) => `${num(i.printable_width, 0)}"` },
  { name: "price_per_sqft", label: "$/sqft", mono: true, render: (i) => money(i.price_per_sqft) },
  { name: "sticker_compatible", label: "Sticker", render: (i) => (i.sticker_compatible ? "Yes" : "—") },
];
const presetFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "width", label: "Width (in)", type: "number", default: 24 },
  { name: "height", label: "Height (in)", type: "number", default: 18 },
];
const presetCols = [
  { name: "name", label: "Name" },
  { name: "width", label: "W", mono: true, render: (i) => `${num(i.width, 0)}"` },
  { name: "height", label: "H", mono: true, render: (i) => `${num(i.height, 0)}"` },
];

const sell = (t) => t?.selling_price ?? t?.wholesale_price;

export default function LargeFormat() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sizes, setSizes] = useState([{ width: 24, height: 18, qty: 1 }]);
  const [mode, setMode] = useState("print");
  const [laminate, setLaminate] = useState(false);
  const [machineId, setMachineId] = useState("none");
  const [inkCoverage, setInkCoverage] = useState(100);
  const [presets, setPresets] = useState([]);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => { api.get("/size-presets").then((r) => setPresets(r.data)); }, []);

  const addRow = () => sizes.length < 25 && setSizes([...sizes, { width: 12, height: 12, qty: 1 }]);
  const rmRow = (i) => setSizes(sizes.filter((_, idx) => idx !== i));
  const upd = (i, k, v) => setSizes(sizes.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const addPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (p && sizes.length < 25) setSizes([...sizes, { width: p.width, height: p.height, qty: 1 }]);
  };

  const calc = async () => {
    try {
      const body = { sizes: sizes.map((s) => ({ width: +s.width, height: +s.height, qty: +s.qty })), mode, laminate,
        machine_id: machineId !== "none" ? machineId : null, ink_coverage_pct: inkCoverage };
      const { data } = await api.post("/calc/largeformat", body);
      setRes(data);
      setSel(data.results[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (Array.isArray(rq.sizes) && rq.sizes.length) setSizes(rq.sizes);
    if (rq.mode) setMode(rq.mode);
    if (rq.laminate != null) setLaminate(rq.laminate);
    if (rq.machineId) setMachineId(rq.machineId);
    if (rq.inkCoverage != null) setInkCoverage(rq.inkCoverage);
  }, calc);

  const totalPieces = sizes.reduce((a, s) => a + (+s.qty || 0), 0);

  return (
    <div data-testid="large-format-page">
      <PageHeader title="Large Format" eyebrow="Live Pricing" subtitle="Roll media · nesting · tiling · comparison" />
      <div className="p-8">
        <Tabs defaultValue="estimate">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="estimate" data-testid="tab-estimate" className="rounded-full">Estimating</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-materials" className="rounded-full">Roll Materials</TabsTrigger>}
            {isAdmin && <TabsTrigger value="presets" data-testid="tab-presets" className="rounded-full">Size Presets</TabsTrigger>}
          </TabsList>

          <TabsContent value="estimate" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 h-fit">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-head font-bold">Sizes ({sizes.length}/25)</h3>
                <div className="flex gap-2">
                  <Select onValueChange={addPreset}>
                    <SelectTrigger data-testid="preset-select" className="rounded-lg h-9 w-40 text-xs"><SelectValue placeholder="+ Add preset" /></SelectTrigger>
                    <SelectContent>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button data-testid="add-size-button" onClick={addRow} size="sm" variant="outline" className="rounded-lg"><Plus size={15} /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-mono uppercase text-slate-500 px-1">
                  <span className="col-span-4">Width in</span><span className="col-span-4">Height in</span><span className="col-span-3">Qty</span><span></span>
                </div>
                {sizes.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`size-row-${i}`}>
                    <Input className="col-span-4 rounded-lg num" type="number" value={s.width} onChange={(e) => upd(i, "width", e.target.value)} />
                    <Input className="col-span-4 rounded-lg num" type="number" value={s.height} onChange={(e) => upd(i, "height", e.target.value)} />
                    <Input className="col-span-3 rounded-lg num" type="number" value={s.qty} onChange={(e) => upd(i, "qty", e.target.value)} />
                    <button className="col-span-1 text-slate-400 hover:text-red-500" onClick={() => rmRow(i)}><X size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Finishing Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger data-testid="mode-select" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label className="text-xs">Extra Lamination</Label>
                  <Switch data-testid="lf-laminate" checked={laminate} onCheckedChange={setLaminate} />
                </div>
              </div>
              {isAdmin && <InkPicker machineId={machineId} setMachineId={setMachineId} coverage={inkCoverage} setCoverage={setInkCoverage} categories={["largeformat"]} />}
              <Button data-testid="calc-lf-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />Compare Materials
              </Button>
            </div>

            <div className="lg:col-span-7">
              {!res || !sel ? (
                <EmptyState>Add sizes and compare compatible materials.</EmptyState>
              ) : (
                <div className="space-y-6" data-testid="lf-results">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric icon={Layers} label="Pieces" value={totalPieces} />
                    <Metric icon={Ruler} label="Print Width" value={`${num(sel.material.printable_width, 0)}"`} />
                    {sell(sel.total) != null && <Metric icon={Tag} label={sel.total.selling_price != null ? "Retail Total" : "Wholesale Total"} value={money(sell(sel.total))} accent />}
                    <Metric icon={DollarSign} label="Material" value={money(sel.total.material_cost ?? 0)} sub={`Print ${money(sel.total.printing_cost ?? 0)}`} />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <SectionLabel>{sel.material.name} · Layout</SectionLabel>
                    <div className="space-y-1 mb-3">
                      {sel.sizes.map((s, i) => (
                        <div key={i} className="flex justify-between text-xs num text-slate-600">
                          <span>{num(s.width, 0)}×{num(s.height, 0)}" ×{s.qty}{s.tiled && <span className="ml-1 text-amber-600">tiled {s.panels}p</span>}</span>
                          <span>{money(s.selling_price ?? s.wholesale_price)}</span>
                        </div>
                      ))}
                    </div>
                    {sel.total.machine_name && (
                      <div className="flex justify-between text-xs num text-[#2495D3] pb-2 mb-1 border-b border-slate-100" data-testid="lf-ink-line">
                        <span>Ink · {sel.total.machine_name} · {sel.total.ink_ml} ml</span>
                        <span>{money(sel.total.ink_cost)}</span>
                      </div>
                    )}
                    {sel.layout && <NestingCanvas layout={sel.layout} />}
                    <PricingPanel r={sel.total} className="mt-3" />
                    <div className="mt-3 flex justify-end">
                      <SaveQuoteBar module="Gran Formato" title={`${sel.material.name} · ${res.mode}`} inputs={{ sizes, mode, laminate, machineId, inkCoverage }} summary={sel} />
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Compare Materials</SectionLabel>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {res.results.map((r, idx) => {
                        const isSel = sel.material.id === r.material.id;
                        return (
                          <button key={r.material.id} data-testid="lf-compare-row" onClick={() => setSel(r)}
                            className={`text-left rounded-xl border p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                            <div className="flex items-center justify-between">
                              <div className="font-head font-bold text-sm">{r.material.name}</div>
                              {idx === 0 && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best Value</span>}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{num(r.material.printable_width, 0)}" print</div>
                            <div className="num text-xl font-black text-[#2495D3] mt-2">{money(sell(r.total))}</div>
                            {r.total.selling_price != null && r.total.wholesale_price != null && (
                              <div className="text-[11px] text-slate-500 num">WS {money(r.total.wholesale_price)}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            {isAdmin && <CrudManager endpoint="roll-materials" fields={matFields} columns={matCols} prefix="material" />}
          </TabsContent>
          <TabsContent value="presets" className="mt-6">
            {isAdmin && <CrudManager endpoint="size-presets" fields={presetFields} columns={presetCols} prefix="preset" onChange={setPresets} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
