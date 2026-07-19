import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import SizesEditor from "@/components/SizesEditor";
import NestingCanvas from "@/components/NestingCanvas";
import { TotalsBlock, CostRow } from "@/components/Totals";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

const sheetFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "code", label: "Code", type: "text" },
  { name: "inks", label: "Inks", type: "text", default: "CMYKWW" },
  { name: "price_per_sqft", label: "Price / ft² (CAD)", type: "number", default: 0.55 },
  { name: "cnc_capable", label: "CNC Cut Capable", type: "switch" },
  { name: "channel_capable", label: "Channel Letters Capable", type: "switch" },
];
const sheetCols = [
  { name: "name", label: "Material" },
  { name: "code", label: "Code", mono: true },
  { name: "inks", label: "Inks", mono: true },
  { name: "price_per_sqft", label: "$/ft²", mono: true, render: (i) => money(i.price_per_sqft) },
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
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/config").then((r) => setSheetSizes(Object.keys(r.data.big_sheets))); }, []);

  const calc = async () => {
    try {
      const body = {
        sheet_size: sheetSize, cnc, cnc_cut_length_in: +cncLen,
        sizes: sizes.map((s) => ({ label: s.label, w: +s.w, h: +s.h, qty: +s.qty })),
      };
      const { data } = await api.post("/calc/directprint", body);
      if (!data.results.length) toast.info("Add sheet materials first.");
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="direct-print-page">
      <PageHeader title="Direct Print (UV)" subtitle="Sheets 4x8 / 5x10 · CMYKWW · auto-nesting · optional CNC" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-sheet-materials">Sheet Materials</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
              <h3 className="font-head font-bold mb-3">Pieces</h3>
              <SizesEditor sizes={sizes} setSizes={setSizes} module="directprint" />
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Sheet size</Label>
                  <Select value={sheetSize} onValueChange={setSheetSize}>
                    <SelectTrigger data-testid="dp-sheet-size" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{sheetSizes.map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label className="text-xs">CNC Cut</Label>
                  <Switch data-testid="dp-cnc" checked={cnc} onCheckedChange={setCnc} />
                </div>
                {cnc && (
                  <div className="col-span-2"><Label className="text-xs">CNC cut length (in)</Label><Input data-testid="dp-cnc-len" type="number" value={cncLen} onChange={(e) => setCncLen(e.target.value)} className="rounded-sm mt-1 num" /></div>
                )}
              </div>
              <Button data-testid="calc-dp-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Compare Materials
              </Button>
            </div>
            <div className="lg:col-span-5">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Enter pieces and compare materials.</div>
              ) : (
                <div className="space-y-4" data-testid="dp-results">
                  {res.results.map((r, i) => (
                    <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-head font-bold">{r.material.name}{i === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Best</span>}</div>
                        <SaveQuoteBar module="Direct Print" title={`Direct ${r.material.name} ${sheetSize}`} summary={r} />
                      </div>
                      <div className="text-xs text-slate-500 num mb-1">{r.sheets} sheet(s) · {r.print_sqft} ft²</div>
                      {r.layout && <NestingCanvas layout={r.layout} />}
                      <div className="mt-3">
                        <CostRow label="Material (sheets)" value={r.sheet_cost} />
                        <CostRow label="UV print" value={r.print_cost} />
                        <CostRow label="CNC cut" value={r.cnc_cost} />
                      </div>
                      <TotalsBlock r={r} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          {isAdmin && (
            <TabsContent value="materials" className="mt-6">
              <CrudManager endpoint="sheet-materials" fields={sheetFields} columns={sheetCols} prefix="sheet-material" />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
