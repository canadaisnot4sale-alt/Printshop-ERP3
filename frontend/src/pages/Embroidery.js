import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { TotalsBlock, CostRow } from "@/components/Totals";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, Plus, X } from "lucide-react";

export default function Embroidery() {
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState("none");
  const [quantity, setQuantity] = useState(12);
  const [digitizing, setDigitizing] = useState(false);
  const [placements, setPlacements] = useState([{ label: "Left chest", stitch_count: 8000 }]);
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/garments").then((r) => setGarments(r.data)); }, []);

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

  return (
    <div data-testid="embroidery-page">
      <PageHeader title="Embroidery" subtitle="Multiple logo areas · per-1,000 stitches + optional digitizing" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-head font-bold">Logo Areas</h3>
            <Button data-testid="emb-add" onClick={add} size="sm" variant="outline" className="rounded-sm"><Plus size={15} /></Button>
          </div>
          <div className="grid grid-cols-12 gap-2 text-[10px] font-mono uppercase text-slate-500 px-1 mb-1">
            <span className="col-span-7">Area / Label</span><span className="col-span-4">Stitches</span><span />
          </div>
          <div className="space-y-2">
            {placements.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`emb-row-${i}`}>
                <Input className="col-span-7 rounded-sm" placeholder="e.g. Back" value={p.label} onChange={(e) => upd(i, "label", e.target.value)} />
                <Input className="col-span-4 rounded-sm num" type="number" value={p.stitch_count} onChange={(e) => upd(i, "stitch_count", e.target.value)} />
                <button className="col-span-1 text-slate-400 hover:text-red-500" onClick={() => rm(i)}><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div>
              <Label className="text-xs">Garment (optional)</Label>
              <Select value={garmentId} onValueChange={setGarmentId}>
                <SelectTrigger data-testid="emb-garment-select" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Embroidery only (no garment)</SelectItem>
                  {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Quantity</Label><Input data-testid="emb-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-sm mt-1 num" /></div>
          </div>
          <div className="flex items-center justify-between py-3">
            <Label className="text-xs">Digitizing charge (1–3 logos)</Label>
            <Switch data-testid="emb-digitizing" checked={digitizing} onCheckedChange={setDigitizing} />
          </div>
          <Button data-testid="calc-embroidery-button" onClick={calc} className="w-full mt-2 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Calculate
          </Button>
        </div>
        <div className="lg:col-span-5">
          {!res ? (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Add logo areas and calculate.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="embroidery-results">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-head font-bold">Estimate · {res.quantity} pcs</h3>
                <SaveQuoteBar module="Embroidery" title={`Embroidery ${res.total_stitches}st x${res.quantity}`} summary={res} />
              </div>
              <div className="text-xs text-slate-500 num mb-2">{res.logos} logo(s) · {res.total_stitches} stitches</div>
              <CostRow label="Garment cost" value={res.garment_cost} />
              <CostRow label="Embroidery" value={res.embroidery_cost} />
              <CostRow label="Digitizing" value={res.setup} />
              <TotalsBlock r={res} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
