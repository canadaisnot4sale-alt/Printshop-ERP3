import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

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

  const Row = ({ label, val, hl }) => (
    <div className="flex justify-between py-2 border-b border-slate-100">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`num tabular text-sm ${hl ? "text-[#2495D3] font-bold" : ""}`}>{val}</span>
    </div>
  );

  return (
    <div data-testid="booklet-page">
      <PageHeader title="Booklets" subtitle="Cover + inside paper · binding · production cost" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
          <h3 className="font-head font-bold mb-4">Booklet Specification</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">Cover Paper</Label>
              <Select value={f.cover_stock_id} onValueChange={(v) => set("cover_stock_id", v)}>
                <SelectTrigger data-testid="cover-select" className="rounded-sm mt-1"><SelectValue placeholder="Cover" /></SelectTrigger>
                <SelectContent>{stocks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Inside Pages Paper</Label>
              <Select value={f.inside_stock_id} onValueChange={(v) => set("inside_stock_id", v)}>
                <SelectTrigger data-testid="inside-select" className="rounded-sm mt-1"><SelectValue placeholder="Inside" /></SelectTrigger>
                <SelectContent>{stocks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Page Count</Label><Input data-testid="page-count" type="number" value={f.page_count} onChange={(e) => set("page_count", e.target.value)} className="rounded-sm mt-1" /></div>
            <div><Label className="text-xs">Quantity</Label><Input data-testid="quantity" type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="rounded-sm mt-1" /></div>
            <div><Label className="text-xs">Width (in)</Label><Input type="number" value={f.width} onChange={(e) => set("width", e.target.value)} className="rounded-sm mt-1" /></div>
            <div><Label className="text-xs">Height (in)</Label><Input type="number" value={f.height} onChange={(e) => set("height", e.target.value)} className="rounded-sm mt-1" /></div>
            <div className="col-span-2">
              <Label className="text-xs">Binding</Label>
              <Select value={f.binding} onValueChange={(v) => set("binding", v)}>
                <SelectTrigger data-testid="binding-select" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{BINDINGS.map((b) => <SelectItem key={b.v} value={b.v}>{b.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center justify-between py-1">
              <Label className="text-xs">Laminated Cover</Label>
              <Switch data-testid="laminate-cover" checked={f.laminate_cover} onCheckedChange={(v) => set("laminate_cover", v)} />
            </div>
          </div>
          <Button data-testid="calc-booklet-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Calculate
          </Button>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-sm p-6 sticky top-24" data-testid="booklet-results">
            <h3 className="font-head font-bold mb-4">Estimate</h3>
            {!res ? <p className="text-sm text-slate-400">Fill the spec and calculate.</p> : (
              <>
                <Row label={`Cover sheets`} val={res.cover_sheets} />
                <Row label={`Inside sheets`} val={res.inside_sheets} />
                <Row label="Cover cost" val={money(res.cover_cost)} />
                <Row label="Inside cost" val={money(res.inside_cost)} />
                <Row label="Printing" val={money(res.print_cost)} />
                <Row label="Lamination" val={money(res.lamination)} />
                <Row label="Binding" val={money(res.binding_cost)} />
                <Row label="Total production cost" val={money(res.total_cost)} />
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Customer Price</div>
                  <div className="num text-4xl font-black text-[#2495D3] mt-1">{money(res.customer_price)}</div>
                  <div className="text-xs text-slate-500 mt-1 num">{money(res.unit_price)} / unit · Wholesale {money(res.wholesale_price)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
