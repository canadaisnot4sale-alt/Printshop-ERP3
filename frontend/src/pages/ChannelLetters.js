import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import SizesEditor from "@/components/SizesEditor";
import NestingCanvas from "@/components/NestingCanvas";
import { CostRow } from "@/components/Totals";
import { Metric, EmptyState, SectionLabel, priceOf, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { useRequote } from "@/lib/useRequote";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Type, FileStack, Tag } from "lucide-react";

export default function ChannelLetters() {
  const [sheetSizes, setSheetSizes] = useState(["4x8", "5x10"]);
  const [sheetSize, setSheetSize] = useState("4x8");
  const [letters, setLetters] = useState([{ label: "Uppercase", w: 12, h: 12, qty: 5 }]);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => { api.get("/config").then((r) => setSheetSizes(Object.keys(r.data.big_sheets))); }, []);

  const calc = async () => {
    try {
      const body = {
        sheet_size: sheetSize,
        letters: letters.map((l) => ({ label: l.label, width: +l.w, height: +l.h, qty: +l.qty })),
      };
      const { data } = await api.post("/calc/channelletters", body);
      if (!data.results.length) toast.info("Mark sheet materials as 'Channel Letters Capable' in Direct Print.");
      setRes(data);
      setSel(data.results[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (Array.isArray(rq.letters) && rq.letters.length) setLetters(rq.letters);
    if (rq.sheetSize) setSheetSize(rq.sheetSize);
  }, calc);

  return (
    <div data-testid="channel-letters-page">
      <PageHeader title="Channel Letters" eyebrow="Live Pricing" subtitle={'Enter width & height per letter · +1" fixture margin per side · auto-nested'} />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-head font-bold mb-1">Letters</h3>
          <p className="text-xs text-slate-500 mb-3">Add a row per size (e.g. uppercase vs lowercase). Each face is cut with a 1" fixture margin on every side.</p>
          <SizesEditor sizes={letters} setSizes={setLetters} module="channel" />
          <div className="mt-5">
            <Label className="text-xs">Sheet size</Label>
            <Select value={sheetSize} onValueChange={setSheetSize}>
              <SelectTrigger data-testid="cl-sheet-size" className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{sheetSizes.map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button data-testid="calc-cl-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
            <Calculator size={16} className="mr-2" />Compare Materials
          </Button>
        </div>
        <div className="lg:col-span-6">
          {!res || !sel ? (
            <EmptyState>Add letters and compare materials.</EmptyState>
          ) : (
            <div className="space-y-6" data-testid="cl-results">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric icon={Type} label="Letters" value={sel.quantity} sub={`margin ${sel.fixture_margin}"`} />
                <Metric icon={FileStack} label="Sheets" value={`${sel.face_sheets} + ${sel.return_sheets}`} sub="face + return" />
                {priceOf(sel) != null && <Metric icon={Tag} label={sel.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(sel))} accent />}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <SectionLabel>{sel.material.name} · Layout</SectionLabel>
                {sel.layout && <NestingCanvas layout={sel.layout} />}
                <div className="mt-3">
                  <CostRow label="Faces" value={sel.face_cost} />
                  <CostRow label="Returns" value={sel.return_cost} />
                  <CostRow label="Labor" value={sel.labor} />
                </div>
                <PricingPanel r={sel} className="mt-3" />
                <div className="mt-3 flex justify-end"><SaveQuoteBar module="Channel Letters" title={`Channel x${sel.quantity} ${sel.material.name}`} inputs={{ letters, sheetSize }} summary={sel} /></div>
              </div>
              <div>
                <SectionLabel>Compare Materials</SectionLabel>
                <div className="grid sm:grid-cols-2 gap-3">
                  {res.results.map((r, idx) => {
                    const isSel = sel.material.id === r.material.id;
                    return (
                      <button key={r.material.id} data-testid="cl-compare-row" onClick={() => setSel(r)}
                        className={`text-left rounded-xl border p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-head font-bold text-sm">{r.material.name}</div>
                          {idx === 0 && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best</span>}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{r.face_sheets}+{r.return_sheets} sheets</div>
                        <div className="num text-xl font-black text-[#2495D3] mt-2">{money(priceOf(r))}</div>
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
