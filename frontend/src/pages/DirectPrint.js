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
import { InkPicker } from "@/components/InkPicker";
import { useRequote } from "@/lib/useRequote";
import { useDefaultSheetSize } from "@/lib/useDefaultSheetSize";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, FileStack, Ruler, Tag } from "lucide-react";

const sheetFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "code", label: "Code", type: "text" },
  { name: "inks", label: "Inks", type: "text", default: "CMYKWW" },
  { name: "price_per_sqft", label: "Price / ft² (CAD)", type: "number", default: 0.55 },
  { name: "cnc_capable", label: "CNC Cut Capable", type: "switch" },
  { name: "channel_capable", label: "Channel Letters Capable", type: "switch" },
  { name: "linked_material_id", label: "Link to Materials DB (cost from purchases)", type: "material-link", full: true },
];
const sheetCols = [
  { name: "name", label: "Material" },
  { name: "code", label: "Code", mono: true },
  { name: "inks", label: "Inks", mono: true },
  { name: "price_per_sqft", label: "$/ft²", mono: true, render: (i) => money(i.price_per_sqft) },
  { name: "linked", label: "Linked", render: (i) => i.linked_material_name || "—" },
  { name: "cnc_capable", label: "CNC", render: (i) => (i.cnc_capable ? "Yes" : "—") },
  { name: "channel_capable", label: "Channel", render: (i) => (i.channel_capable ? "Yes" : "—") },
];

export default function DirectPrint() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sheetSizes, setSheetSizes] = useState(["4x8", "5x10"]);
  const [sizes, setSizes] = useState([{ label: "Panel", w: 24, h: 18, qty: 4 }]);
  const [sheetSize, setSheetSize] = useState("4x8");
  const [cnc, setCnc] = useState(false);
  const [cncLen, setCncLen] = useState(0);
  const [machineId, setMachineId] = useState("none");
  const [inkCoverage, setInkCoverage] = useState(100);
  const [roundCorners, setRoundCorners] = useState(false);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => { api.get("/config").then((r) => setSheetSizes(Object.keys(r.data.big_sheets))); }, []);
  // Default Sheet size to the size of this module's DEFAULT material (unless re-quoting)
  useDefaultSheetSize("/sheet-materials?module=direct-print", setSheetSize);

  const calc = async () => {
    try {
      const body = {
        sheet_size: sheetSize, cnc, cnc_cut_length_in: +cncLen,
        sizes: sizes.map((s) => ({ label: s.label, w: +s.w, h: +s.h, qty: +s.qty })),
        machine_id: machineId !== "none" ? machineId : null, ink_coverage_pct: inkCoverage,
        round_corners: roundCorners,
      };
      const { data } = await api.post("/calc/directprint", body);
      if (!data.results.length) toast.info("Add sheet materials first.");
      setRes(data);
      setSel(data.results.find((r) => r.material?.is_default) || data.results[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (Array.isArray(rq.sizes) && rq.sizes.length) setSizes(rq.sizes);
    if (rq.sheetSize) setSheetSize(rq.sheetSize);
    if (rq.cnc != null) setCnc(rq.cnc);
    if (rq.cncLen != null) setCncLen(rq.cncLen);
  }, calc);

  return (
    <div data-testid="direct-print-page">
      <PageHeader title="Direct Print (UV)" eyebrow="Live Pricing" subtitle="Sheets 4x8 / 5x10 · CMYKWW · auto-nesting · optional CNC" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-sheet-materials" className="rounded-full">Sheet Materials</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-head font-bold mb-3">Pieces</h3>
              <SizesEditor sizes={sizes} setSizes={setSizes} module="directprint" />
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Sheet size</Label>
                  <Select value={sheetSize} onValueChange={setSheetSize}>
                    <SelectTrigger data-testid="dp-sheet-size" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{[...new Set([...sheetSizes, ...(sheetSize ? [sheetSize] : [])])].map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label className="text-xs">CNC Cut</Label>
                  <Switch data-testid="dp-cnc" checked={cnc} onCheckedChange={setCnc} />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label className="text-xs">Round Corners</Label>
                  <Switch data-testid="dp-round-corners" checked={roundCorners} onCheckedChange={setRoundCorners} />
                </div>
                {cnc && (
                  <div className="col-span-2"><Label className="text-xs">CNC cut length (in)</Label><Input data-testid="dp-cnc-len" type="number" value={cncLen} onChange={(e) => setCncLen(e.target.value)} className="rounded-lg mt-1 num" /></div>
                )}
              </div>
              {isAdmin && <InkPicker machineId={machineId} setMachineId={setMachineId} coverage={inkCoverage} setCoverage={setInkCoverage} categories={["directprint"]} />}
              <Button data-testid="calc-dp-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />Compare Materials
              </Button>
            </div>
            <div className="lg:col-span-6">
              {!res || !sel ? (
                <EmptyState>Enter pieces and compare materials.</EmptyState>
              ) : (
                <div className="space-y-6" data-testid="dp-results">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Metric icon={FileStack} label="Sheets" value={sel.sheets} sub={`${sel.sheet_size} ft`} />
                    <Metric icon={Ruler} label="Print Area" value={`${sel.print_sqft} ft²`} />
                    {priceOf(sel) != null && <Metric icon={Tag} label={sel.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(sel))} accent />}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <SectionLabel>{sel.material.name} · Layout</SectionLabel>
                    {sel.layout && <NestingCanvas layout={sel.layout} />}
                    <div className="mt-3">
                      <CostRow label="Material (sheets)" value={sel.sheet_cost} />
                      <CostRow label="UV print" value={sel.print_cost} />
                      <CostRow label="CNC cut" value={sel.cnc_cost} />
                    </div>
                    <PricingPanel r={sel} className="mt-3" />
                    <div className="mt-3 flex justify-end"><SaveQuoteBar module="Direct Print" title={`Direct ${sel.material.name} ${sheetSize}`} inputs={{ sizes, sheetSize, cnc, cncLen }} summary={sel} /></div>
                  </div>
                  <div>
                    <SectionLabel>Compare Materials</SectionLabel>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {res.results.map((r, idx) => {
                        const isSel = sel.material.id === r.material.id;
                        return (
                          <button key={r.material.id} data-testid="dp-compare-row" onClick={() => setSel(r)}
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
              <CrudManager endpoint="sheet-materials" fields={sheetFields} columns={sheetCols} prefix="sheet-material" readOnly />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
