import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
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
  { name: "name", label: "Nombre", type: "text", full: true },
  { name: "code", label: "Código", type: "text" },
  { name: "inks", label: "Tintas", type: "text", default: "CMYKWW" },
  { name: "price_per_sqft", label: "Precio / ft² (CAD)", type: "number", default: 0.55 },
  { name: "cnc_capable", label: "Corte CNC", type: "switch" },
  { name: "channel_capable", label: "Apto Channel Letters", type: "switch" },
];
const sheetCols = [
  { name: "name", label: "Material" },
  { name: "code", label: "Código", mono: true },
  { name: "inks", label: "Tintas", mono: true },
  { name: "price_per_sqft", label: "$/ft²", mono: true, render: (i) => money(i.price_per_sqft) },
  { name: "cnc_capable", label: "CNC", render: (i) => (i.cnc_capable ? "Sí" : "—") },
  { name: "channel_capable", label: "Channel", render: (i) => (i.channel_capable ? "Sí" : "—") },
];

export default function DirectPrint() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sizes, setSizes] = useState(["4x8", "5x10"]);
  const [f, setF] = useState({ sheet_size: "4x8", piece_width: 24, piece_height: 18, quantity: 4, cnc: false, cnc_cut_length_in: 0 });
  const [res, setRes] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { api.get("/config").then((r) => setSizes(Object.keys(r.data.big_sheets))); }, []);

  const calc = async () => {
    try {
      const body = { sheet_size: f.sheet_size, piece_width: +f.piece_width, piece_height: +f.piece_height, quantity: +f.quantity, cnc: f.cnc, cnc_cut_length_in: +f.cnc_cut_length_in };
      const { data } = await api.post("/calc/directprint", body);
      if (!data.results.length) toast.info("Registra materiales de hoja primero.");
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="direct-print-page">
      <PageHeader title="Impresión Directa (UV)" subtitle="Hojas 4x8 / 5x10 · CMYKWW · corte CNC opcional" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculadora</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-sheet-materials">Materiales de Hoja</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6 h-fit">
              <h3 className="font-head font-bold mb-4">Trabajo</h3>
              <Label className="text-xs">Tamaño de hoja</Label>
              <Select value={f.sheet_size} onValueChange={(v) => set("sheet_size", v)}>
                <SelectTrigger data-testid="dp-sheet-size" className="rounded-sm mt-1 mb-3"><SelectValue /></SelectTrigger>
                <SelectContent>{sizes.map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
              </Select>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Ancho (in)</Label><Input data-testid="dp-w" type="number" value={f.piece_width} onChange={(e) => set("piece_width", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Alto (in)</Label><Input data-testid="dp-h" type="number" value={f.piece_height} onChange={(e) => set("piece_height", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Cantidad</Label><Input data-testid="dp-qty" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1 num" /></div>
              </div>
              <div className="flex items-center justify-between py-3">
                <Label className="text-xs">Corte CNC</Label>
                <Switch data-testid="dp-cnc" checked={f.cnc} onCheckedChange={(v) => set("cnc", v)} />
              </div>
              {f.cnc && (
                <div><Label className="text-xs">Longitud de corte (pulg. lin.)</Label><Input data-testid="dp-cnc-len" type="number" value={f.cnc_cut_length_in} onChange={(e) => set("cnc_cut_length_in", e.target.value)} className="rounded-sm mt-1 num" /></div>
              )}
              <Button data-testid="calc-dp-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Comparar Materiales
              </Button>
            </div>
            <div className="lg:col-span-7">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Ingresa el trabajo y compara materiales.</div>
              ) : (
                <div className="space-y-4" data-testid="dp-results">
                  {res.results.map((r, i) => (
                    <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-head font-bold">{r.material.name}{i === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Mejor</span>}</div>
                        <SaveQuoteBar module="Impresión Directa" title={`Directa ${r.material.name} ${f.sheet_size}`} summary={r} />
                      </div>
                      <div className="text-xs text-slate-500 num mb-1">{r.n_up}-up · {r.sheets} hoja(s) · {r.print_sqft} ft²</div>
                      <CostRow label="Material (hojas)" value={r.sheet_cost} />
                      <CostRow label="Impresión UV" value={r.print_cost} />
                      <CostRow label="Corte CNC" value={r.cnc_cost} />
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
