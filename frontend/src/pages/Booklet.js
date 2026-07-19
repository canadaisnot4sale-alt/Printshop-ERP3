import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric, ConfigCard, EmptyState, SectionLabel, priceOf } from "@/components/Metric";
import { CostRow, TotalsBlock } from "@/components/Totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { toast } from "sonner";
import { Calculator, BookOpen, FileStack, Layers, DollarSign } from "lucide-react";

const BINDINGS = [
  { v: "saddle", l: "Saddle Stitch" },
  { v: "spiral", l: "Spiral" },
  { v: "wireo", l: "Wire-O" },
  { v: "perfect", l: "Perfect Binding (Glue)" },
];

export default function Booklet() {
  const [stocks, setStocks] = useState([]);
  const [f, setF] = useState({
    cover_stock_id: "", inside_stock_id: "", page_count: 8, quantity: 100,
    width: 8.5, height: 11, binding: "saddle", laminate_cover: false, sheet_key: "13x19",
  });
  const [res, setRes] = useState(null);

  useEffect(() => {
    api.get("/paper-stocks").then((r) => {
      setStocks(r.data);
      if (r.data[0]) setF((p) => ({ ...p, cover_stock_id: r.data[0].id, inside_stock_id: (r.data[1] || r.data[0]).id }));
    });
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const calc = async () => {
    try {
      const body = { ...f, page_count: +f.page_count, quantity: +f.quantity, width: +f.width, height: +f.height };
      const { data } = await api.post("/calc/booklet", body);
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const bindingLabel = BINDINGS.find((b) => b.v === f.binding)?.l;

  return (
    <div data-testid="booklet-page">
      <PageHeader title="Booklets" eyebrow="Live Pricing" subtitle="Cover + inside paper · binding · production cost" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <ConfigCard title="Booklet Specification">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Cover Paper</Label>
                <Select value={f.cover_stock_id} onValueChange={(v) => set("cover_stock_id", v)}>
                  <SelectTrigger data-testid="cover-select" className="rounded-lg mt-1"><SelectValue placeholder="Cover" /></SelectTrigger>
                  <SelectContent>{stocks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Inside Pages Paper</Label>
                <Select value={f.inside_stock_id} onValueChange={(v) => set("inside_stock_id", v)}>
                  <SelectTrigger data-testid="inside-select" className="rounded-lg mt-1"><SelectValue placeholder="Inside" /></SelectTrigger>
                  <SelectContent>{stocks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Page Count</Label><Input data-testid="page-count" type="number" value={f.page_count} onChange={(e) => set("page_count", e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Quantity</Label><Input data-testid="quantity" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Width (in)</Label><Input type="number" value={f.width} onChange={(e) => set("width", e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Height (in)</Label><Input type="number" value={f.height} onChange={(e) => set("height", e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div className="col-span-2">
                <Label className="text-xs">Binding</Label>
                <Select value={f.binding} onValueChange={(v) => set("binding", v)}>
                  <SelectTrigger data-testid="binding-select" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{BINDINGS.map((b) => <SelectItem key={b.v} value={b.v}>{b.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center justify-between py-1">
                <Label className="text-xs">Laminated Cover</Label>
                <Switch data-testid="laminate-cover" checked={f.laminate_cover} onCheckedChange={(v) => set("laminate_cover", v)} />
              </div>
            </div>
            <Button data-testid="calc-booklet-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
              <Calculator size={16} className="mr-2" />Calculate
            </Button>
          </ConfigCard>
        </div>

        <div className="lg:col-span-7">
          {!res ? (
            <EmptyState>Fill the specification and calculate to see a full production breakdown.</EmptyState>
          ) : (
            <div className="space-y-6" data-testid="booklet-results">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric icon={FileStack} label="Cover Sheets" value={res.cover_sheets} />
                <Metric icon={Layers} label="Inside Sheets" value={res.inside_sheets} />
                <Metric icon={BookOpen} label="Binding" value={bindingLabel?.split(" ")[0]} sub={`${f.page_count}pp`} />
                {priceOf(res) != null && <Metric icon={DollarSign} label={`Price · ${f.quantity}`} value={new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(priceOf(res))} accent />}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <SectionLabel>Cost Breakdown</SectionLabel>
                  <CostRow label="Cover cost" value={res.cover_cost} />
                  <CostRow label="Inside cost" value={res.inside_cost} />
                  <CostRow label="Printing" value={res.print_cost} />
                  <CostRow label="Lamination" value={res.lamination} />
                  <CostRow label="Binding" value={res.binding_cost} />
                  <CostRow label="Total production cost" value={res.total_cost} />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
                  <SectionLabel>{res.cover?.name} · {res.inside?.name}</SectionLabel>
                  <div className="mt-auto"><TotalsBlock r={res} /></div>
                  <div className="mt-4 flex justify-end">
                    <SaveQuoteBar module="Booklet" title={`Booklet ${res.cover?.name || ""} x${f.quantity}`} summary={res} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
