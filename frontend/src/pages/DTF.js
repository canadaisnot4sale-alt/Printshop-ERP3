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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

const garmentFields = [
  { name: "name", label: "Nombre", type: "text", full: true },
  { name: "category", label: "Categoría", type: "select", options: ["tshirt", "hoodie", "polo", "otro"], default: "tshirt" },
  { name: "cost_each", label: "Costo c/u (CAD)", type: "number", default: 4.5 },
];
const garmentCols = [
  { name: "name", label: "Prenda" },
  { name: "category", label: "Tipo" },
  { name: "cost_each", label: "Costo", mono: true, render: (i) => money(i.cost_each) },
];

export default function DTF() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [garments, setGarments] = useState([]);
  const [f, setF] = useState({ garment_id: "none", print_width: 10, print_height: 12, quantity: 12 });
  const [res, setRes] = useState(null);

  useEffect(() => { api.get("/garments").then((r) => setGarments(r.data)); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const calc = async () => {
    try {
      const body = {
        garment_id: f.garment_id === "none" ? null : f.garment_id,
        print_width: +f.print_width, print_height: +f.print_height, quantity: +f.quantity,
      };
      const { data } = await api.post("/calc/dtf", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="dtf-page">
      <PageHeader title="DTF / Playeras" subtitle="Impresión DTF por tamaño + prenda + mano de obra" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculadora</TabsTrigger>
            {isAdmin && <TabsTrigger value="garments" data-testid="tab-garments">Prendas</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6">
              <h3 className="font-head font-bold mb-4">Configuración</h3>
              <Label className="text-xs">Prenda (opcional)</Label>
              <Select value={f.garment_id} onValueChange={(v) => set("garment_id", v)}>
                <SelectTrigger data-testid="garment-select" className="rounded-sm mt-1 mb-4"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Solo impresión (sin prenda)</SelectItem>
                  {garments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Ancho (in)</Label><Input data-testid="dtf-width" type="number" value={f.print_width} onChange={(e) => set("print_width", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Alto (in)</Label><Input data-testid="dtf-height" type="number" value={f.print_height} onChange={(e) => set("print_height", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Cantidad</Label><Input data-testid="dtf-qty" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1 num" /></div>
              </div>
              <Button data-testid="calc-dtf-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Calcular
              </Button>
            </div>
            <div className="lg:col-span-7">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Configura la impresión y calcula.</div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="dtf-results">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-head font-bold">Estimado ({res.quantity} pzas)</h3>
                    <SaveQuoteBar module="DTF" title={`DTF ${f.print_width}x${f.print_height} x${res.quantity}`} summary={res} disabled={!res} />
                  </div>
                  <div className="text-xs text-slate-500 num mb-3">Área impresión: {res.print_area_sqft} ft²</div>
                  <CostRow label="Costo prenda" value={res.garment_cost} />
                  <CostRow label="Impresión DTF" value={res.dtf_cost} />
                  <CostRow label="Mano de obra" value={res.labor} />
                  <CostRow label="Costo base" value={res.base_cost} />
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
