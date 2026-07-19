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
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

const matFields = [
  { name: "name", label: "Nombre", type: "text", full: true },
  { name: "sheet_width", label: "Ancho hoja (in)", type: "number", default: 24 },
  { name: "sheet_height", label: "Alto hoja (in)", type: "number", default: 18 },
  { name: "cost_per_sheet", label: "Costo / hoja (CAD)", type: "number", default: 8 },
];
const matCols = [
  { name: "name", label: "Material" },
  { name: "sheet_width", label: "Hoja", mono: true, render: (i) => `${i.sheet_width}×${i.sheet_height}"` },
  { name: "cost_per_sheet", label: "Costo/hoja", mono: true, render: (i) => money(i.cost_per_sheet) },
];

export default function Laser() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [f, setF] = useState({ piece_width: 6, piece_height: 6, cut_length_in: 24, engrave_area_sqin: 4, quantity: 10 });
  const [res, setRes] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const calc = async () => {
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v]));
      const { data } = await api.post("/calc/laser", body);
      if (!data.results.length) toast.info("Registra materiales láser primero.");
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="laser-page">
      <PageHeader title="Productos Láser" subtitle="Material + corte + grabado" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculadora</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-laser-materials">Materiales</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6 h-fit">
              <h3 className="font-head font-bold mb-4">Trabajo</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Ancho pieza (in)</Label><Input data-testid="laser-w" type="number" value={f.piece_width} onChange={(e) => set("piece_width", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Alto pieza (in)</Label><Input data-testid="laser-h" type="number" value={f.piece_height} onChange={(e) => set("piece_height", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Corte (pulgadas lin.)</Label><Input data-testid="laser-cut" type="number" value={f.cut_length_in} onChange={(e) => set("cut_length_in", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Grabado (in²)</Label><Input data-testid="laser-engrave" type="number" value={f.engrave_area_sqin} onChange={(e) => set("engrave_area_sqin", e.target.value)} className="rounded-sm mt-1 num" /></div>
                <div><Label className="text-xs">Cantidad</Label><Input data-testid="laser-qty" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1 num" /></div>
              </div>
              <Button data-testid="calc-laser-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Comparar Materiales
              </Button>
            </div>
            <div className="lg:col-span-7">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Ingresa el trabajo y compara materiales.</div>
              ) : (
                <div className="space-y-4" data-testid="laser-results">
                  {res.results.map((r, i) => (
                    <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-head font-bold">{r.material.name}{i === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Mejor</span>}</div>
                        <SaveQuoteBar module="Láser" title={`Láser ${r.material.name} x${r.quantity}`} summary={r} />
                      </div>
                      <div className="text-xs text-slate-500 num mb-1">{r.n_up}-up · {r.sheets} hoja(s)</div>
                      <CostRow label="Material" value={r.sheet_cost} />
                      <CostRow label="Corte" value={r.cut_cost} />
                      <CostRow label="Grabado" value={r.engrave_cost} />
                      <CostRow label="Setup" value={r.setup} />
                      <TotalsBlock r={r} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          {isAdmin && (
            <TabsContent value="materials" className="mt-6">
              <CrudManager endpoint="laser-materials" fields={matFields} columns={matCols} prefix="laser-material" />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
