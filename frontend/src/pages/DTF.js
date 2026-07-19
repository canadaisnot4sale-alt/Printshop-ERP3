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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

const garmentFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "category", label: "Category", type: "select", options: ["tshirt", "hoodie", "polo", "other"], default: "tshirt" },
  { name: "cost_each", label: "Cost each (CAD)", type: "number", default: 4.5 },
];
const garmentCols = [
  { name: "name", label: "Garment" },
  { name: "category", label: "Type" },
  { name: "cost_each", label: "Cost", mono: true, render: (i) => money(i.cost_each) },
];

export default function DTF() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState("none");
  const [quantity, setQuantity] = useState(24);
  const [placements, setPlacements] = useState([
    { label: "Front", w: 4, h: 4 }, { label: "Back", w: 8.5, h: 11 },
  ]);
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/garments").then((r) => setGarments(r.data)); }, []);

  const calc = async () => {
    try {
      const body = {
        garment_id: garmentId === "none" ? null : garmentId,
        placements: placements.map((p) => ({ label: p.label, w: +p.w, h: +p.h })),
        quantity: +quantity,
      };
      const { data } = await api.post("/calc/dtf", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="dtf-page">
      <PageHeader title="DTF / Apparel" subtitle={'Auto-nests logo placements on a 12" DTF roll · per-garment material section'} />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="garments" data-testid="tab-garments">Garments</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
              <h3 className="font-head font-bold mb-4">Logo Placements</h3>
              <SizesEditor sizes={placements} setSizes={setPlacements} module="dtf" cols={["label", "w", "h"]} max={12} />
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Garment (optional)</Label>
                  <Select value={garmentId} onValueChange={setGarmentId}>
                    <SelectTrigger data-testid="garment-select" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Print only (no garment)</SelectItem>
                      {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Quantity</Label><Input data-testid="dtf-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-sm mt-1 num" /></div>
              </div>
              <Button data-testid="calc-dtf-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Calculate
              </Button>
            </div>
            <div className="lg:col-span-5">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Add logo placements and calculate.</div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="dtf-results">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-head font-bold">Estimate · {res.quantity} pcs</h3>
                    <SaveQuoteBar module="DTF" title={`DTF x${res.quantity}`} summary={res} />
                  </div>
                  <div className="text-xs text-slate-500 num mb-2">Section {res.section_length}" · {res.area_per_garment_sqft} ft²/garment</div>
                  {res.layout && <NestingCanvas layout={res.layout} />}
                  <div className="mt-3">
                    <CostRow label="Garment cost" value={res.garment_cost} />
                    <CostRow label="DTF print" value={res.dtf_cost} />
                    <CostRow label="Labor" value={res.labor} />
                  </div>
                  <TotalsBlock r={res} />
                </div>
              )}
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="garments" className="mt-6">
              <CrudManager endpoint="garments" fields={garmentFields} columns={garmentCols} prefix="garment" onChange={setGarments} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
