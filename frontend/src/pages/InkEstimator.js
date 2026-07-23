import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric, ConfigCard, EmptyState, SectionLabel } from "@/components/Metric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Droplet, Upload, Ruler, DollarSign, Gauge, Sparkles } from "lucide-react";

export default function InkEstimator() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [w, setW] = useState(96);
  const [h, setH] = useState(48);
  const [qty, setQty] = useState(1);
  const [coverage, setCoverage] = useState(100);
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);

  // calibration
  const [calW, setCalW] = useState(48.8);
  const [calH, setCalH] = useState(11.8);
  const [calCov, setCalCov] = useState(100);
  const [calMl, setCalMl] = useState("");
  const [calFile, setCalFile] = useState(null);

  const load = () => api.get("/machines").then((r) => { setMachines(r.data); if (!machineId && r.data[0]) setMachineId(r.data[0].id); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const estimate = async () => {
    if (!machineId) return toast.error("Select a machine");
    try {
      const fd = new FormData();
      fd.append("machine_id", machineId);
      fd.append("width_in", w);
      fd.append("height_in", h);
      fd.append("quantity", qty);
      if (file) fd.append("file", file);
      else fd.append("coverage_pct", coverage);
      const { data } = await api.post("/ink/estimate", fd);
      setRes(data);
      if (data.source === "file") setCoverage(Math.round(data.coverage_pct));
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const calibrate = async () => {
    if (!machineId) return toast.error("Select a machine");
    if (!calMl) return toast.error("Enter the VersaWorks ink ml");
    const areaSqft = (+calW * +calH) / 144;
    try {
      let data;
      if (calFile) {
        const fd = new FormData();
        fd.append("machine_id", machineId);
        fd.append("print_area_sqft", areaSqft);
        fd.append("actual_ml", calMl);
        fd.append("file", calFile);
        ({ data } = await api.post("/ink/calibrate-file", fd));
      } else {
        ({ data } = await api.post("/ink/calibrate", { machine_id: machineId, area_sqft: areaSqft, coverage_pct: +calCov, actual_ml: +calMl }));
      }
      toast.success(`Learned! ${data.machine} → ${data.new_ml_per_sqft_full} ml/ft²${data.coverage_pct != null ? ` (file coverage ${data.coverage_pct}%)` : ""} · ${data.samples} samples${data.siblings_updated ? ` · applied to ${data.siblings_updated} sibling machine(s)` : ""}`);
      setCalMl(""); setCalFile(null); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  const machine = machines.find((m) => m.id === machineId);

  return (
    <div data-testid="ink-estimator-page">
      <PageHeader title="Ink / Toner Estimator" eyebrow="Business Control" subtitle="Estimate ink cost by coverage or by analyzing the actual file — calibrates itself from your VersaWorks numbers" />
      <div className="p-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <ConfigCard title="Job">
            <Label className="text-xs">Machine</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger data-testid="ink-machine-select" className="rounded-lg mt-1 mb-4"><SelectValue placeholder="Choose machine" /></SelectTrigger>
              <SelectContent>{machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Width (in)</Label><Input data-testid="ink-width" type="number" value={w} onChange={(e) => setW(e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Height (in)</Label><Input data-testid="ink-height" type="number" value={h} onChange={(e) => setH(e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Quantity</Label><Input data-testid="ink-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-lg mt-1 num" /></div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ink coverage {file ? "(from file)" : ""}</Label>
                <span className="num text-sm font-bold text-[#2495D3]">{coverage}%</span>
              </div>
              <div className="flex gap-2 my-2">
                {[25, 50, 75, 100].map((c) => (
                  <button key={c} data-testid={`ink-cov-${c}`} onClick={() => { setCoverage(c); setFile(null); }}
                    className={`flex-1 py-1.5 text-xs rounded-lg border ${coverage === c && !file ? "bg-[#2495D3] text-white border-[#2495D3]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{c}%</button>
                ))}
              </div>
              <Slider min={5} max={100} step={5} value={[coverage]} onValueChange={(v) => { setCoverage(v[0]); setFile(null); }} />
            </div>

            <div className="mt-5">
              <Label className="text-xs">Or analyze the artwork file (auto coverage)</Label>
              <label className="mt-1 flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-3 cursor-pointer hover:border-[#2495D3]" data-testid="ink-file-label">
                <Upload size={16} className="text-slate-400" />
                <span className="text-sm text-slate-500 truncate">{file ? file.name : "Upload PDF / PNG / JPG / TIFF"}</span>
                <input data-testid="ink-file-input" type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              {file && <button onClick={() => setFile(null)} className="text-xs text-slate-400 mt-1 hover:text-red-500">Clear file</button>}
            </div>

            <Button data-testid="ink-estimate-button" onClick={estimate} className="w-full mt-5 bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
              <Droplet size={16} className="mr-2" />Estimate Ink
            </Button>
          </ConfigCard>

          <ConfigCard title="Calibrate from a real VersaWorks job">
            <p className="text-xs text-slate-500 mb-3">Enter what VersaWorks shows (Print Area + Ink Consumption). Attach the same file and the coverage is measured automatically, so the machine's ml/ft² self-adjusts to reality.</p>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Print W (in)</Label><Input data-testid="cal-w" type="number" value={calW} onChange={(e) => setCalW(e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Print H (in)</Label><Input data-testid="cal-h" type="number" value={calH} onChange={(e) => setCalH(e.target.value)} className="rounded-lg mt-1 num" /></div>
              <div><Label className="text-xs">Ink (ml)</Label><Input data-testid="cal-ml" type="number" value={calMl} onChange={(e) => setCalMl(e.target.value)} className="rounded-lg mt-1 num" /></div>
            </div>
            <label className="mt-3 flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 cursor-pointer hover:border-[#2495D3]" data-testid="cal-file-label">
              <Upload size={15} className="text-slate-400" />
              <span className="text-sm text-slate-500 truncate">{calFile ? calFile.name : "Attach printed file (auto coverage) — recommended"}</span>
              <input data-testid="cal-file-input" type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setCalFile(e.target.files?.[0] || null)} />
            </label>
            {!calFile && (
              <div className="mt-3"><Label className="text-xs">Coverage % (only if no file)</Label><Input data-testid="cal-cov" type="number" value={calCov} onChange={(e) => setCalCov(e.target.value)} className="rounded-lg mt-1 num" /></div>
            )}
            <Button data-testid="ink-calibrate-button" onClick={calibrate} variant="outline" className="w-full mt-4 rounded-lg">
              <Sparkles size={15} className="mr-2" />Teach the estimator
            </Button>
          </ConfigCard>
        </div>

        <div className="lg:col-span-7">
          {!res ? (
            <EmptyState>Set the job and estimate, or upload the artwork to auto-detect coverage.</EmptyState>
          ) : (
            <div className="space-y-6" data-testid="ink-results">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric icon={Gauge} label="Coverage" value={`${res.coverage_pct}%`} sub={res.source === "file" ? "from file" : "manual"} />
                <Metric icon={Ruler} label="Print Area" value={`${res.area_sqft} ft²`} />
                <Metric icon={Droplet} label="Ink Used" value={`${res.ink_ml} ml`} />
                <Metric icon={DollarSign} label="Ink Cost" value={money(res.ink_cost)} accent />
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <SectionLabel>{res.machine} · Ink profile</SectionLabel>
                <div className="flex justify-between text-sm py-1.5 border-b border-slate-100"><span className="text-slate-500">ml per ft² @ 100%</span><span className="num">{res.ml_per_sqft_full}</span></div>
                <div className="flex justify-between text-sm py-1.5 border-b border-slate-100"><span className="text-slate-500">Cost per ml</span><span className="num">{money(res.cost_per_ml)}</span></div>
                <div className="flex justify-between text-sm py-1.5"><span className="text-slate-500">Calibration samples</span><span className="num">{res.samples}</span></div>
                <p className="text-xs text-slate-400 mt-3">Estimate = area × coverage × ml/ft². Feed real VersaWorks ml in the calibrate panel to make {res.machine} more accurate over time.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
