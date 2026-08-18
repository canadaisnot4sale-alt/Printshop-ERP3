import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { CostRow } from "@/components/Totals";
import { Metric, ConfigCard, EmptyState, SectionLabel, priceOf, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import VolumePricingTable from "@/components/VolumePricingTable";
import { useRequote } from "@/lib/useRequote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Plus, X, Sparkles, Hash, Tag } from "lucide-react";

export default function Embroidery() {
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState("none");
  const [quantity, setQuantity] = useState(12);
  const [digitizing, setDigitizing] = useState(false);
  const [placements, setPlacements] = useState([{ label: "Left chest", stitch_count: 8000 }]);
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/garments").then((r) => { setGarments(r.data); const d = r.data.find((g) => g.is_default); if (d) setGarmentId(d.id); }); }, []);

  const add = () => placements.length < 8 && setPlacements([...placements, { label: "", stitch_count: 5000 }]);
  const rm = (i) => setPlacements(placements.filter((_, idx) => idx !== i));
  const upd = (i, k, v) => setPlacements(placements.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));

  const calc = async () => {
    try {
      const body = {
        garment_id: garmentId === "none" ? null : garmentId,
        placements: placements.map((p) => ({ label: p.label, stitch_count: +p.stitch_count })),
        quantity: +quantity, digitizing,
      };
      const { data } = await api.post("/calc/embroidery", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (rq.garmentId !== undefined) setGarmentId(rq.garmentId || "none");
    if (rq.quantity != null) setQuantity(rq.quantity);
    if (rq.digitizing != null) setDigitizing(rq.digitizing);
    if (Array.isArray(rq.placements) && rq.placements.length) setPlacements(rq.placements);
  }, calc);

  return (
    <div data-testid="embroidery-page">
      <PageHeader title="Embroidery" eyebrow="Live Pricing" subtitle="Multiple logo areas · per-1,000 stitches + optional digitizing" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-head font-bold">Logo Areas</h3>
            <Button data-testid="emb-add" onClick={add} size="sm" variant="outline" className="rounded-lg"><Plus size={15} /></Button>
          </div>
          <div className="grid grid-cols-12 gap-2 text-[10px] font-mono uppercase text-slate-500 px-1 mb-1">
            <span className="col-span-7">Area / Label</span><span className="col-span-4">Stitches</span><span />
          </div>
          <div className="space-y-2">
            {placements.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`emb-row-${i}`}>
                <Input className="col-span-7 rounded-lg" placeholder="e.g. Back" value={p.label} onChange={(e) => upd(i, "label", e.target.value)} />
                <Input className="col-span-4 rounded-lg num" type="number" value={p.stitch_count} onChange={(e) => upd(i, "stitch_count", e.target.value)} />
                <button className="col-span-1 text-slate-400 hover:text-red-500" onClick={() => rm(i)}><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div>
              <Label className="text-xs">Garment (optional)</Label>
              <Select value={garmentId} onValueChange={setGarmentId}>
                <SelectTrigger data-testid="emb-garment-select" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Embroidery only (no garment)</SelectItem>
                  {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Quantity</Label><Input data-testid="emb-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg mt-1 num" /></div>
          </div>
          <div className="flex items-center justify-between py-3">
            <Label className="text-xs">Digitizing charge (1–3 logos)</Label>
            <Switch data-testid="emb-digitizing" checked={digitizing} onCheckedChange={setDigitizing} />
          </div>
          <Button data-testid="calc-embroidery-button" onClick={calc} className="w-full mt-2 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
            <Calculator size={16} className="mr-2" />Calculate
          </Button>
        </div>
        <div className="lg:col-span-6">
          {!res ? (
            <EmptyState>Add logo areas and calculate.</EmptyState>
          ) : (
            <div className="space-y-6" data-testid="embroidery-results">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric icon={Sparkles} label="Logos" value={res.logos} />
                <Metric icon={Hash} label="Stitches" value={res.total_stitches} />
                <Metric icon={Hash} label="Quantity" value={res.quantity} />
                {priceOf(res) != null && <Metric icon={Tag} label={res.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(res))} accent />}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <SectionLabel>Cost Breakdown</SectionLabel>
                <CostRow label="Garment cost" value={res.garment_cost} />
                <CostRow label="Embroidery" value={res.embroidery_cost} />
                <CostRow label="Digitizing" value={res.setup} />
                <PricingPanel r={res} className="mt-3" />
                <VolumePricingTable className="mt-4" endpoint="/calc/embroidery"
                  makeBody={(q) => ({ garment_id: garmentId === "none" ? null : garmentId, placements: placements.map((p) => ({ label: p.label, stitch_count: +p.stitch_count })), quantity: q, digitizing })}
                  extract={(d) => d} signature={`${garmentId}|${digitizing}|${JSON.stringify(placements)}`} unitLabel="unit" />
                <div className="mt-3 flex justify-end"><SaveQuoteBar module="Embroidery" title={`Embroidery ${res.total_stitches}st x${res.quantity}`} inputs={{ garmentId, quantity, digitizing, placements }} summary={res} /></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
