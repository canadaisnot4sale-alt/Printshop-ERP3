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
import VolumePricingTable from "@/components/VolumePricingTable";
import { useRequote } from "@/lib/useRequote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Ruler, Shirt, Hash, Tag } from "lucide-react";

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

  useRequote((rq) => {
    if (rq.garmentId !== undefined) setGarmentId(rq.garmentId || "none");
    if (rq.quantity != null) setQuantity(rq.quantity);
    if (Array.isArray(rq.placements) && rq.placements.length) setPlacements(rq.placements);
  }, calc);

  return (
    <div data-testid="dtf-page">
      <PageHeader title="DTF / Apparel" eyebrow="Live Pricing" subtitle={'Auto-nests logo placements on a 12" DTF roll · per-garment material section'} />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="garments" data-testid="tab-garments" className="rounded-full">Garments</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-head font-bold mb-4">Logo Placements</h3>
              <SizesEditor sizes={placements} setSizes={setPlacements} module="dtf" cols={["label", "w", "h"]} max={12} />
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-xs">Garment (optional)</Label>
                  <Select value={garmentId} onValueChange={setGarmentId}>
                    <SelectTrigger data-testid="garment-select" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Print only (no garment)</SelectItem>
                      {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Quantity</Label><Input data-testid="dtf-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg mt-1 num" /></div>
              </div>
              <Button data-testid="calc-dtf-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />Calculate
              </Button>
            </div>
            <div className="lg:col-span-6">
              {!res ? (
                <EmptyState>Add logo placements and calculate.</EmptyState>
              ) : (
                <div className="space-y-6" data-testid="dtf-results">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric icon={Hash} label="Quantity" value={res.quantity} />
                    <Metric icon={Ruler} label="Area / Garment" value={`${res.area_per_garment_sqft} ft²`} />
                    <Metric icon={Shirt} label="Section" value={`${res.section_length}"`} />
                    {priceOf(res) != null && <Metric icon={Tag} label={res.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(res))} accent />}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <SectionLabel>DTF Roll Layout</SectionLabel>
                    {res.layout && <NestingCanvas layout={res.layout} />}
                    <div className="mt-3">
                      <CostRow label="Garment cost" value={res.garment_cost} />
                      <CostRow label="DTF print" value={res.dtf_cost} />
                      <CostRow label="Labor" value={res.labor} />
                    </div>
                    <PricingPanel r={res} className="mt-3" />
                    <VolumePricingTable className="mt-4" endpoint="/calc/dtf"
                      makeBody={(q) => ({ garment_id: garmentId === "none" ? null : garmentId, placements: placements.map((p) => ({ label: p.label, w: +p.w, h: +p.h })), quantity: q })}
                      extract={(d) => d} signature={`${garmentId}|${JSON.stringify(placements)}`} unitLabel="unit" />
                    <div className="mt-3 flex justify-end"><SaveQuoteBar module="DTF" title={`DTF x${res.quantity}`} inputs={{ garmentId, quantity, placements }} summary={res} /></div>
                  </div>
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
