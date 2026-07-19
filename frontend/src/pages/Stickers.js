import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export default function Stickers() {
  const [w, setW] = useState(3);
  const [h, setH] = useState(3);
  const [qty, setQty] = useState(100);
  const [res, setRes] = useState(null);

  const calc = async () => {
    try {
      const { data } = await api.post("/calc/sticker", { width: +w, height: +h, qty: +qty });
      if (data.results.length === 0) toast.info("No sticker-compatible materials. Flag a roll material as sticker-compatible.");
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

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
      <PageHeader title="Sticker Calculator" subtitle={'Sizes 1" – 8" · sticker-compatible materials only'} />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-sm p-6 h-fit">
          <h3 className="font-head font-bold mb-4">Sticker Size</h3>
          <SizeCtl label="Width" val={w} set={setW} />
          <SizeCtl label="Height" val={h} set={setH} />
          <Label className="text-xs">Quantity</Label>
          <Input data-testid="sticker-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-sm mt-1 mb-4 num" />
          <Button data-testid="calc-sticker-button" onClick={calc} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Compare Materials
          </Button>
        </div>
        <div className="lg:col-span-8">
          {!res ? (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Pick a size and compare sticker material pricing.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4" data-testid="sticker-results">
              {res.results.map((r, idx) => (
                <div key={r.material_id} className="bg-white border border-slate-200 rounded-sm p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-head font-bold">{r.material}</div>
                    {idx === 0 && <span className="text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Best</span>}
                  </div>
                  <div className="num text-3xl font-black text-[#2495D3] mt-3">{money(r.selling_price)}</div>
                  <div className="text-xs text-slate-500 num mt-1">{money(r.unit_price)} / sticker · {r.billed_sqft} sqft</div>
                  <div className="text-xs text-slate-500 num mt-2 border-t border-slate-100 pt-2">
                    Material {money(r.material_cost)} · Wholesale {money(r.wholesale_price)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
