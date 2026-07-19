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

export default function ChannelLetters() {
  const [sizes, setSizes] = useState(["4x8", "5x10"]);
  const [heights, setHeights] = useState([6, 12, 16, 18, 22, 24, 36, 48]);
  const [f, setF] = useState({ sheet_size: "4x8", letter_height: "24", quantity: 10 });
  const [res, setRes] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get("/config").then((r) => { setSizes(Object.keys(r.data.big_sheets)); setHeights(r.data.channel_heights); });
  }, []);

  const calc = async () => {
    try {
      const body = { sheet_size: f.sheet_size, letter_height: +f.letter_height, quantity: +f.quantity };
      const { data } = await api.post("/calc/channelletters", body);
      if (!data.results.length) toast.info("Marca materiales de hoja como 'Apto Channel Letters' en Impresión Directa.");
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="channel-letters-page">
      <PageHeader title="Channel Letters" subtitle={'Auto-cálculo de letras por hoja · alturas 6" – 48"'} />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6 h-fit">
          <h3 className="font-head font-bold mb-4">Configuración</h3>
          <Label className="text-xs">Tamaño de hoja</Label>
          <Select value={f.sheet_size} onValueChange={(v) => set("sheet_size", v)}>
            <SelectTrigger data-testid="cl-sheet-size" className="rounded-sm mt-1 mb-3"><SelectValue /></SelectTrigger>
            <SelectContent>{sizes.map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
          </Select>
          <Label className="text-xs">Altura de letra</Label>
          <Select value={f.letter_height} onValueChange={(v) => set("letter_height", v)}>
            <SelectTrigger data-testid="cl-height" className="rounded-sm mt-1 mb-3"><SelectValue /></SelectTrigger>
            <SelectContent>{heights.map((h) => <SelectItem key={h} value={String(h)}>{h}"</SelectItem>)}</SelectContent>
          </Select>
          <Label className="text-xs">Cantidad de letras</Label>
          <Input data-testid="cl-qty" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1 num" />
          <Button data-testid="calc-cl-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Comparar Materiales
          </Button>
        </div>
        <div className="lg:col-span-7">
          {!res ? (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Configura las letras y compara materiales.</div>
          ) : (
            <div className="space-y-4" data-testid="cl-results">
              {res.results.map((r, i) => (
                <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-head font-bold">{r.material.name}{i === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Mejor</span>}</div>
                    <SaveQuoteBar module="Channel Letters" title={`Channel ${r.letter_height}" x${r.quantity} ${r.material.name}`} summary={r} />
                  </div>
                  <div className="text-xs text-slate-500 num mb-1">Letra {r.letter_height}×{r.letter_width}" · {r.faces_per_sheet}/hoja · {r.face_sheets} hoja(s) caras + {r.return_sheets} retornos</div>
                  <CostRow label="Caras" value={r.face_cost} />
                  <CostRow label="Retornos" value={r.return_cost} />
                  <CostRow label="Mano de obra" value={r.labor} />
                  <TotalsBlock r={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
