import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplet } from "lucide-react";

// Optional ink/machine picker embedded in print calculators. Ink cost is added into the quote.
export function InkPicker({ machineId, setMachineId, coverage, setCoverage, categories }) {
  const [machines, setMachines] = useState([]);
  useEffect(() => {
    api.get("/machines").then((r) => {
      let list = r.data || [];
      if (categories) list = list.filter((m) => categories.includes(m.category));
      setMachines(list);
    }).catch(() => {});
  }, [categories]);

  return (
    <div className="rounded-xl border border-slate-200 p-4 mt-5" data-testid="ink-picker">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
        <Droplet size={13} /> Machine & Ink (optional)
      </div>
      <Label className="text-xs">Machine</Label>
      <Select value={machineId} onValueChange={setMachineId}>
        <SelectTrigger data-testid="ink-picker-machine" className="rounded-lg mt-1"><SelectValue placeholder="No ink cost" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— No ink cost —</SelectItem>
          {machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {machineId && machineId !== "none" && (
        <div className="mt-3">
          <div className="flex justify-between"><Label className="text-xs">Ink coverage</Label><span className="num text-xs font-bold text-[#2495D3]">{coverage}%</span></div>
          <div className="flex gap-2 mt-1">
            {[25, 50, 75, 100].map((c) => (
              <button key={c} type="button" data-testid={`ink-picker-cov-${c}`} onClick={() => setCoverage(c)}
                className={`flex-1 py-1 text-xs rounded-lg border ${coverage === c ? "bg-[#2495D3] text-white border-[#2495D3]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{c}%</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
