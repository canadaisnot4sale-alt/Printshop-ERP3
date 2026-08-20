import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import NestingCanvas from "@/components/NestingCanvas";
import { Metric, ConfigCard, EmptyState, SectionLabel, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import VolumePricingTable from "@/components/VolumePricingTable";
import { useRequote } from "@/lib/useRequote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Ruler, Hash, Tag, DollarSign } from "lucide-react";

const FINISHING = [
  { v: "kisscut", l: "Kiss-Cut (on sheet)" },
  { v: "diecut", l: "Die-Cut (through)" },
  { v: "individual", l: "Individually Cut" },
];

const sell = (r) => r?.selling_price ?? r?.wholesale_price;
const unit = (r) => r?.unit_price ?? r?.wholesale_unit;

export default function Stickers() {
  const [w, setW] = useState(3);
  const [h, setH] = useState(3);
  const [qty, setQty] = useState(100);
  const [finishing, setFinishing] = useState("kisscut");
  const [laminate, setLaminate] = useState(false);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);

  const calc = async () => {
    try {
      const { data } = await api.post("/calc/sticker", { width: +w, height: +h, qty: +qty, finishing, laminate });
      if (data.results.length === 0) toast.info("No sticker-compatible materials. Flag a roll material as sticker-compatible.");
      setRes(data);
      setSel(data.results.find((r) => r.is_default) || data.results[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (rq.w != null) setW(rq.w);
    if (rq.h != null) setH(rq.h);
    if (rq.qty != null) setQty(rq.qty);
    if (rq.finishing) setFinishing(rq.finishing);
    if (rq.laminate != null) setLaminate(rq.laminate);
  }, calc, { moduleKey: "stickers", inputs: { w, h, qty, finishing, laminate }, hasResult: !!sel });

  const SizeCtl = ({ label, val, set }) => (
    <div className="mb-5">
      <div className="flex justify-between mb-2">
        <Label className="text-xs">{label}</Label>
        <span className="num text-sm font-semibold text-[#2495D3]">{val}"</span>
      </div>
      <Slider min={1} max={8} step={0.25} value={[val]} onValueChange={(v) => set(v[0])} />
    </div>
  );

  return (
    <div data-testid="stickers-page">
      <PageHeader title="Sticker Calculator" eyebrow="Live Pricing" subtitle={'Sizes 1" – 8" · lamination, kiss-cut / die-cut / individual cut'} />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <ConfigCard title="Sticker Size">
            <SizeCtl label="Width" val={w} set={setW} />
            <SizeCtl label="Height" val={h} set={setH} />
            <Label className="text-xs">Quantity</Label>
            <Input data-testid="sticker-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-lg mt-1 mb-4 num" />
            <Label className="text-xs">Finishing</Label>
            <Select value={finishing} onValueChange={setFinishing}>
              <SelectTrigger data-testid="sticker-finishing" className="rounded-lg mt-1 mb-3"><SelectValue /></SelectTrigger>
              <SelectContent>{FINISHING.map((fi) => <SelectItem key={fi.v} value={fi.v}>{fi.l}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center justify-between py-2 mb-3">
              <Label className="text-xs">Lamination</Label>
              <Switch data-testid="sticker-laminate" checked={laminate} onCheckedChange={setLaminate} />
            </div>
            <Button data-testid="calc-sticker-button" onClick={calc} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
              <Calculator size={16} className="mr-2" />Compare Materials
            </Button>
          </ConfigCard>
        </div>
        <div className="lg:col-span-8">
          {!res || !sel ? (
            <EmptyState>Pick a size and finishing to compare sticker material pricing.</EmptyState>
          ) : (
            <div className="space-y-6" data-testid="sticker-results">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric icon={Ruler} label="Size" value={`${w}×${h}"`} />
                <Metric icon={Hash} label="Quantity" value={qty} sub={`${sel.billed_sqft} sqft`} />
                {sell(sel) != null && <Metric icon={Tag} label={sel.selling_price != null ? "Retail" : "Wholesale"} value={money(sell(sel))} accent />}
                {unit(sel) != null && <Metric icon={DollarSign} label="Per Sticker" value={money(unit(sel))} />}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <SectionLabel>{sel.material} · Layout</SectionLabel>
                {sel.layout && <NestingCanvas layout={sel.layout} />}
                <PricingPanel r={sel} className="mt-3" />
                <VolumePricingTable className="mt-4" endpoint="/calc/sticker"
                  makeBody={(q) => ({ width: +w, height: +h, qty: q, finishing, laminate })}
                  extract={(d) => (d.results || []).find((r) => r.material_id === sel.material_id) || (d.results || [])[0]}
                  signature={`${w}|${h}|${finishing}|${laminate}|${sel.material_id}`} unitLabel="sticker" />
                <div className="mt-3 flex justify-end">
                  <SaveQuoteBar module="Stickers" title={`Sticker ${w}x${h} x${qty} · ${sel.material}`} inputs={{ w, h, qty, finishing, laminate }} summary={sel} />
                </div>
              </div>

              <div>
                <SectionLabel>Compare Materials · {qty} pcs</SectionLabel>
                <div className="grid sm:grid-cols-2 gap-3">
                  {res.results.map((r, idx) => {
                    const isSel = sel.material_id === r.material_id;
                    return (
                      <button key={r.material_id} data-testid="sticker-compare-row" onClick={() => setSel(r)}
                        className={`text-left rounded-xl border p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-head font-bold text-sm">{r.material}</div>
                          {idx === 0 && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best Value</span>}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{r.billed_sqft} sqft · {r.finishing}</div>
                        <div className="num text-xl font-black text-[#2495D3] mt-2">{money(sell(r))}</div>
                        {unit(r) != null && <div className="text-[11px] text-slate-500 num">{money(unit(r))}/sticker</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
