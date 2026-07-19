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

const matFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "paper_type", label: "Paper Type", type: "select", options: ["gloss", "matte", "transparent", "continuous"], default: "gloss" },
  { name: "roll_cost", label: "Roll cost (CAD)", type: "number" },
  { name: "pieces_per_roll", label: "Pieces / roll", type: "number", default: 1000 },
  { name: "roll_width", label: "Roll width (in)", type: "number", default: 4 },
  { name: "sticker_w", label: "Sticker W (in)", type: "number", default: 3 },
  { name: "sticker_h", label: "Sticker H (in)", type: "number", default: 3 },
];
const matCols = [
  { name: "name", label: "Material" },
  { name: "paper_type", label: "Type" },
  { name: "roll_cost", label: "Roll cost", mono: true, render: (i) => money(i.roll_cost) },
  { name: "pieces_per_roll", label: "Pcs/roll", mono: true },
  { name: "sticker", label: "Size", mono: true, render: (i) => `${i.sticker_w}×${i.sticker_h}"` },
];

export default function RollStickers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mats, setMats] = useState([]);
  const [matId, setMatId] = useState("");
  const [qty, setQty] = useState(500);
  const [res, setRes] = useState(null);

  const load = () => api.get("/roll-sticker-materials").then((r) => { setMats(r.data); if (!matId && r.data[0]) setMatId(r.data[0].id); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const calc = async () => {
    if (!matId) return toast.error("Select a material");
    try {
      const { data } = await api.post("/calc/rollsticker", { material_id: matId, quantity: +qty });
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="roll-stickers-page">
      <PageHeader title="Roll Stickers" subtitle="Label rolls · 5-piece waste + ink cleaning (Epson ColorWorks C6000A)" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="materials" data-testid="tab-rs-materials">Roll Materials</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-sm p-6 h-fit">
              <h3 className="font-head font-bold mb-4">Job</h3>
              <Label className="text-xs">Roll material</Label>
              <Select value={matId} onValueChange={setMatId}>
                <SelectTrigger data-testid="rs-material-select" className="rounded-sm mt-1 mb-4"><SelectValue placeholder="Choose material" /></SelectTrigger>
                <SelectContent>{mats.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.paper_type})</SelectItem>)}</SelectContent>
              </Select>
              <Label className="text-xs">Quantity</Label>
              <Input data-testid="rs-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-sm mt-1 mb-4 num" />
              <Button data-testid="calc-rs-button" onClick={calc} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                <Calculator size={16} className="mr-2" />Calculate
              </Button>
            </div>
            <div className="lg:col-span-7">
              {!res ? (
                <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Select a material and calculate.</div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="rs-results">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-head font-bold">{res.material.name} · {res.quantity} pcs</h3>
                    <SaveQuoteBar module="Roll Stickers" title={`Roll Stickers ${res.material.name} x${res.quantity}`} summary={res} />
                  </div>
                  <div className="text-xs text-slate-500 num mb-2">{res.rolls_needed} roll(s) · {res.waste_pieces} waste · ~{res.production_minutes} min production</div>
                  <CostRow label="Material (rolls)" value={res.material_cost} />
                  <CostRow label="Ink + cleaning" value={res.ink_cost} />
                  <CostRow label="Labor" value={res.labor} />
                  <TotalsBlock r={res} />
                </div>
              )}
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="materials" className="mt-6">
              <CrudManager endpoint="roll-sticker-materials" fields={matFields} columns={matCols} prefix="rs-material" onChange={setMats} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
