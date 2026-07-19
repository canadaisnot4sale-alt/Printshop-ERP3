import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import SizesEditor from "@/components/SizesEditor";
import NestingCanvas from "@/components/NestingCanvas";
import { TotalsBlock, CostRow } from "@/components/Totals";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

export default function ChannelLetters() {
  const [sheetSizes, setSheetSizes] = useState(["4x8", "5x10"]);
  const [sheetSize, setSheetSize] = useState("4x8");
  const [letters, setLetters] = useState([{ label: "Uppercase", w: 12, h: 12, qty: 5 }]);
  const [res, setRes] = useState(null);

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
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="channel-letters-page">
      <PageHeader title="Channel Letters" subtitle={'Enter width & height per letter · +1" fixture margin per side · auto-nested'} />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-sm p-6">
          <h3 className="font-head font-bold mb-1">Letters</h3>
          <p className="text-xs text-slate-500 mb-3">Add a row per size (e.g. uppercase vs lowercase). Each face is cut with a 1" fixture margin on every side.</p>
          <SizesEditor sizes={letters} setSizes={setLetters} module="channel" />
          <div className="mt-5">
            <Label className="text-xs">Sheet size</Label>
            <Select value={sheetSize} onValueChange={setSheetSize}>
              <SelectTrigger data-testid="cl-sheet-size" className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{sheetSizes.map((s) => <SelectItem key={s} value={s}>{s} ft</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button data-testid="calc-cl-button" onClick={calc} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
            <Calculator size={16} className="mr-2" />Compare Materials
          </Button>
        </div>
        <div className="lg:col-span-5">
          {!res ? (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Add letters and compare materials.</div>
          ) : (
            <div className="space-y-4" data-testid="cl-results">
              {res.results.map((r, i) => (
                <div key={r.material.id} className="bg-white border border-slate-200 rounded-sm p-5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-head font-bold">{r.material.name}{i === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Best</span>}</div>
                    <SaveQuoteBar module="Channel Letters" title={`Channel x${r.quantity} ${r.material.name}`} summary={r} />
                  </div>
                  <div className="text-xs text-slate-500 num mb-1">{r.quantity} letters · {r.face_sheets} face sheet(s) + {r.return_sheets} return sheet(s) · margin {r.fixture_margin}"</div>
                  {r.layout && <NestingCanvas layout={r.layout} />}
                  <div className="mt-3">
                    <CostRow label="Faces" value={r.face_cost} />
                    <CostRow label="Returns" value={r.return_cost} />
                    <CostRow label="Labor" value={r.labor} />
                  </div>
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
