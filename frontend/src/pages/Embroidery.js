import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { TotalsBlock, CostRow } from "@/components/Totals";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export default function Embroidery() {
  const [garments, setGarments] = useState([]);
  const [f, setF] = useState({ garment_id: "none", stitch_count: 8000, quantity: 12 });
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/garments").then((r) => setGarments(r.data)); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const calc = async () => {
    try {
      const body = { garment_id: f.garment_id === "none" ? null : f.garment_id, stitch_count: +f.stitch_count, quantity: +f.quantity };
      const { data } = await api.post("/calc/embroidery", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="embroidery-page">
      <PageHeader title="Bordados" subtitle="Precio por puntadas (c/1,000) + digitizado + prenda" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6">
          <h3 className="font-head font-bold mb-4">Configuración</h3>
          <Label className="text-xs">Prenda (opcional)</Label>
          <Select value={f.garment_id} onValueChange={(v) => set("garment_id", v)}>
            <SelectTrigger data-testid="emb-garment-select" className="rounded-sm mt-1 mb-4"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Solo bordado (sin prenda)</SelectItem>
              {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Puntadas</Label><Input data-testid="emb-stitches" type="number" value={f.stitch_count} onChange={(e) => set("stitch_count", e.target.value)} className="rounded-sm mt-1 num" /></div>
            <div><Label className="text-xs">Cantidad</Label><Input data-testid="emb-qty" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1 num" /></div>
          </div>
          <Button data-testid="calc-embroidery-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Calcular
          </Button>
        </div>
        <div className="lg:col-span-7">
          {!res ? (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Configura el bordado y calcula.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="embroidery-results">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-head font-bold">Estimado ({res.quantity} pzas · {res.stitch_count} puntadas)</h3>
                <SaveQuoteBar module="Bordados" title={`Bordado ${res.stitch_count}pts x${res.quantity}`} summary={res} disabled={!res} />
              </div>
              <CostRow label="Costo prenda" value={res.garment_cost} />
              <CostRow label="Bordado" value={res.embroidery_cost} />
              <CostRow label="Digitizado / Setup" value={res.setup} />
              <CostRow label="Costo base" value={res.base_cost} />
              <TotalsBlock r={res} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
