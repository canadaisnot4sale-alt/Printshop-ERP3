import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import NestingCanvas from "@/components/NestingCanvas";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { Plus, X, Calculator } from "lucide-react";

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

export default function LargeFormat() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sizes, setSizes] = useState([{ width: 24, height: 18, qty: 1 }]);
  const [mode, setMode] = useState("print");
  const [laminate, setLaminate] = useState(false);
  const [presets, setPresets] = useState([]);
  const [res, setRes] = useState(null);

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
      const body = { sizes: sizes.map((s) => ({ width: +s.width, height: +s.height, qty: +s.qty })), mode, laminate };
      const { data } = await api.post("/calc/largeformat", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="large-format-page">
      <PageHeader title="Large Format" subtitle="Roll media · nesting · tiling · comparison" />
      <div className="p-8">
        <Tabs defaultValue="estimate">
          <TabsList className="rounded-sm">
            <TabsTrigger value="estimate" data-testid="tab-estimate">Estimating</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-materials">Roll Materials</TabsTrigger>}
            {isAdmin && <TabsTrigger value="presets" data-testid="tab-presets">Size Presets</TabsTrigger>}
          </TabsList>

          <TabsContent value="estimate" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-head font-bold">Sizes ({sizes.length}/25)</h3>
                <div className="flex gap-2">
                  <Select onValueChange={addPreset}>
                    <SelectTrigger data-testid="preset-select" className="rounded-sm h-9 w-40 text-xs"><SelectValue placeholder="+ Add preset" /></SelectTrigger>
                    <SelectContent>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button data-testid="add-size-button" onClick={addRow} size="sm" variant="outline" className="rounded-sm"><Plus size={15} /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-mono uppercase text-slate-500 px-1">
                  <span className="col-span-4">Width in</span><span className="col-span-4">Height in</span><span className="col-span-3">Qty</span><span></span>
                </div>
                {sizes.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`size-row-${i}`}>
                    <Input className="col-span-4 rounded-sm num" type="number" value={s.width} onChange={(e) => upd(i, "width", e.target.value)} />
                    <Input className="col-span-4 rounded-sm num" type="number" value={s.height} onChange={(e) => upd(i, "height", e.target.value)} />
                    <Input className="col-span-3 rounded-sm num" type="number" value={s.qty} onChange={(e) => upd(i, "qty", e.target.value)} />
                    <button className="col-span-1 text-slate-400 hover:text-red-500" onClick={() => rmRow(i)}><X size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Finishing Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger data-testid="mode-select" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label className="text-xs">Extra Lamination</Label>
                  <Switch data-testid="lf-laminate" checked={laminate} onCheckedChange={setLaminate} />
                </div>
              </div>
              <Button data-testid="calc-lf-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Compare Materials
              </Button>
            </div>

            <div className="lg:col-span-5">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Add sizes and compare compatible materials.</div>
              ) : (
                <div className="space-y-4" data-testid="lf-results">
                  {res.results.map((r, idx) => (
                    <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-head font-bold">
                          {r.material.name}
                          {idx === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Best</span>}
                        </div>
                        <div className="text-xs font-mono text-slate-500">{num(r.material.printable_width, 0)}" print</div>
                      </div>
                      <div className="space-y-1 mb-3">
                        {r.sizes.map((s, i) => (
                          <div key={i} className="flex justify-between text-xs num text-slate-600">
                            <span>{num(s.width, 0)}×{num(s.height, 0)}" ×{s.qty}
                              {s.tiled && <span className="ml-1 text-amber-600">tiled {s.panels}p</span>}
                            </span>
                            <span>{money(s.selling_price ?? s.wholesale_price)}</span>
                          </div>
                        ))}
                      </div>
                      {r.layout && <NestingCanvas layout={r.layout} />}
                      {r.total.material_cost != null && (
                        <div className="flex justify-between text-xs text-slate-500 border-t border-slate-100 pt-2 num">
                          <span>Material {money(r.total.material_cost)} · Impresión {money(r.total.printing_cost)}</span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="num text-2xl font-black text-[#2495D3]">{money(r.total.selling_price ?? r.total.wholesale_price)}</span>
                        {r.total.selling_price != null && r.total.wholesale_price != null && (
                          <span className="text-xs text-slate-500 num">Wholesale {money(r.total.wholesale_price)}</span>
                        )}
                      </div>
                      {idx === 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                          <SaveQuoteBar module="Gran Formato" title={`${r.material.name} · ${res.mode}`} summary={r} />
                        </div>
                      )}
                    </div>
                  ))}
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
