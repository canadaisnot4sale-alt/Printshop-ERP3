import { useEffect, useState, useCallback } from "react";
import api, { apiErr } from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2, FileText, Wrench, Sparkles, Clock, Bell, Receipt, Upload } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const TIME_PRESETS = [15, 30, 45, 60, 90, 120];
const TYPE_META = {
  service: { label: "Service", icon: Wrench },
  part: { label: "Part replacement", icon: Wrench },
  cleaning: { label: "Cleaning", icon: Sparkles },
  repair: { label: "Repair", icon: Wrench },
  other: { label: "Other", icon: FileText },
};
const STATUS_STYLE = {
  overdue: "bg-red-100 text-red-700",
  "due-soon": "bg-amber-100 text-amber-700",
  ok: "bg-emerald-100 text-emerald-700",
};

const invoiceUrl = (id) => `${BACKEND}/api/files/${id}/download?auth=${encodeURIComponent(localStorage.getItem("pns_token") || "")}`;

export default function MachineMaintenance({ machines, technicianRate = 65 }) {
  const [sel, setSel] = useState("");
  const [logs, setLogs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [alerts, setAlerts] = useState({ count: 0, overdue: 0, due_soon: 0, alerts: [] });
  const [report, setReport] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [logOpen, setLogOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);

  const machine = machines.find((m) => m.id === sel);

  useEffect(() => { if (!sel && machines.length) setSel(machines[0].id); }, [machines, sel]);

  const loadAlerts = useCallback(() => api.get("/machines/maintenance/alerts").then(({ data }) => setAlerts(data)).catch(() => {}), []);
  const loadReport = useCallback((y) => api.get("/machines/maintenance/tax-report", { params: { year: y } }).then(({ data }) => setReport(data)).catch(() => {}), []);
  const loadMachine = useCallback((id) => {
    if (!id) return;
    api.get(`/machines/${id}/logs`).then(({ data }) => setLogs(data)).catch(() => {});
    api.get(`/machines/${id}/schedules`).then(({ data }) => setSchedules(data)).catch(() => {});
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useEffect(() => { loadReport(year); }, [year, loadReport]);
  useEffect(() => { loadMachine(sel); }, [sel, loadMachine]);

  const refresh = () => { loadMachine(sel); loadAlerts(); loadReport(year); };

  const ytd = logs.reduce((a, l) => a + (l.total || 0), 0);

  return (
    <div className="space-y-6" data-testid="machine-maintenance">
      {/* Alerts banner */}
      <div className={`rounded-xl border p-4 ${alerts.count > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`} data-testid="maintenance-alerts">
        <div className="flex items-center gap-3">
          <Bell size={18} className={alerts.count > 0 ? "text-amber-600" : "text-slate-400"} />
          <div className="flex-1">
            <div className="font-semibold text-sm flex items-center gap-2">
              Maintenance reminders
              {alerts.count > 0 && <Badge className="bg-amber-500 text-white border-0" data-testid="alerts-badge">{alerts.count}</Badge>}
            </div>
            <div className="text-xs text-slate-500">{alerts.overdue} overdue · {alerts.due_soon} due soon</div>
          </div>
        </div>
        {alerts.alerts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {alerts.alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-slate-100" data-testid="alert-row">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={13} className={a.status === "overdue" ? "text-red-500" : "text-amber-500"} />
                  <span className="font-medium">{a.machine_name}</span>
                  <span className="text-slate-500">— {a.part_name}</span>
                </div>
                <Badge className={`${STATUS_STYLE[a.status]} border-0 text-[10px]`}>
                  {a.status === "overdue" ? `overdue ${Math.abs(a.days_until_due)}d` : `in ${a.days_until_due}d`} · due {a.computed_next_due}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Machine selector */}
      <div className="flex flex-wrap gap-2" data-testid="maintenance-machine-selector">
        {machines.map((m) => (
          <button key={m.id} onClick={() => setSel(m.id)} data-testid={`maint-machine-${m.id}`}
            className={`text-sm rounded-full px-4 py-1.5 border transition-colors ${sel === m.id ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
            {m.name}
          </button>
        ))}
      </div>

      {machine && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Deductible {year} (this machine)</div>
              <div className="num text-2xl font-bold text-emerald-600 mt-1">{money(ytd)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Log entries</div>
              <div className="num text-2xl font-bold mt-1">{logs.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Scheduled parts</div>
              <div className="num text-2xl font-bold mt-1">{schedules.length}</div>
            </div>
          </div>

          <Tabs defaultValue="log">
            <TabsList>
              <TabsTrigger value="log" data-testid="tab-log">Service log</TabsTrigger>
              <TabsTrigger value="schedule" data-testid="tab-schedule">Maintenance schedule</TabsTrigger>
              <TabsTrigger value="tax" data-testid="tab-tax">Tax report</TabsTrigger>
            </TabsList>

            {/* SERVICE LOG */}
            <TabsContent value="log" className="pt-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" onClick={() => setLogOpen(true)} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="add-log-button"><Plus size={15} className="mr-1" /> Add entry</Button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-mono uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Detail</th>
                    <th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5 text-right">Cost</th><th className="px-4 py-2.5">Invoice</th><th></th>
                  </tr></thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid="log-row">
                        <td className="px-4 py-2.5 num">{l.date}</td>
                        <td className="px-4 py-2.5"><Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">{TYPE_META[l.type]?.label || l.type}</Badge></td>
                        <td className="px-4 py-2.5">{l.title || l.description}{l.type === "cleaning" && l.cleaning_minutes ? <span className="text-slate-400"> · {l.cleaning_minutes}min @ {money(l.cleaning_rate)}/hr</span> : null}{l.part_number ? <span className="text-slate-400"> · #{l.part_number}</span> : null}</td>
                        <td className="px-4 py-2.5 text-slate-500">{l.supplier || "—"}</td>
                        <td className="px-4 py-2.5 text-right num font-semibold">{money(l.total)}</td>
                        <td className="px-4 py-2.5">{l.invoice_file_id ? <a href={invoiceUrl(l.invoice_file_id)} target="_blank" rel="noreferrer" className="text-[#2495D3] hover:underline inline-flex items-center gap-1" data-testid="invoice-link"><FileText size={13} /> view</a> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => api.delete(`/machine-logs/${l.id}`).then(refresh)} className="text-slate-400 hover:text-red-500" data-testid="log-delete"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No entries yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* SCHEDULE */}
            <TabsContent value="schedule" className="pt-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" onClick={() => setSchedOpen(true)} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="add-schedule-button"><Plus size={15} className="mr-1" /> Add part</Button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-mono uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2.5">Part</th><th className="px-4 py-2.5">Frequency</th><th className="px-4 py-2.5">Last done</th>
                    <th className="px-4 py-2.5">Next due</th><th className="px-4 py-2.5 text-right">Est. cost</th><th className="px-4 py-2.5">Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid="schedule-row">
                        <td className="px-4 py-2.5 font-medium">{s.part_name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{s.recurring ? `every ${s.interval_months} mo` : "one-time"}</td>
                        <td className="px-4 py-2.5 num text-slate-500">{s.last_done || "—"}</td>
                        <td className="px-4 py-2.5 num">{s.computed_next_due || "—"}</td>
                        <td className="px-4 py-2.5 text-right num">{money(s.est_cost)}</td>
                        <td className="px-4 py-2.5"><Badge className={`${STATUS_STYLE[s.status]} border-0 text-[10px]`} data-testid="schedule-status">{s.status}{s.days_until_due != null ? ` · ${s.days_until_due}d` : ""}</Badge></td>
                        <td className="px-4 py-2.5 text-right"><button onClick={() => api.delete(`/machine-schedules/${s.id}`).then(refresh)} className="text-slate-400 hover:text-red-500" data-testid="schedule-delete"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                    {schedules.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No scheduled parts. Add the parts that need periodic replacement.</td></tr>}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAX REPORT */}
            <TabsContent value="tax" className="pt-3">
              <div className="flex items-center gap-3 mb-3">
                <Receipt size={16} className="text-slate-400" />
                <Label className="text-xs">Tax year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="rounded-lg h-8 w-28 text-sm" data-testid="tax-year"><SelectValue /></SelectTrigger>
                  <SelectContent>{[0, 1, 2, 3].map((d) => { const y = new Date().getFullYear() - d; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
                </Select>
                {report && <span className="ml-auto text-sm">Total deductible <span className="num font-bold text-emerald-600 text-lg" data-testid="tax-grand-total">{money(report.grand_total)}</span></span>}
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-mono uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2.5">Machine</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Breakdown</th>
                  </tr></thead>
                  <tbody>
                    {(report?.machines || []).map((m) => (
                      <tr key={m.machine_id} className="border-b border-slate-100" data-testid="tax-machine-row">
                        <td className="px-4 py-2.5 font-medium">{m.machine_name}</td>
                        <td className="px-4 py-2.5 text-right num font-semibold">{money(m.total)}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{Object.entries(m.by_type).map(([t, v]) => `${TYPE_META[t]?.label || t}: ${money(v)}`).join(" · ")}</td>
                      </tr>
                    ))}
                    {(!report || report.machines.length === 0) && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No expenses recorded for {year}.</td></tr>}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {logOpen && <LogDialog machineId={sel} technicianRate={technicianRate} onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); refresh(); }} />}
      {schedOpen && <ScheduleDialog machineId={sel} onClose={() => setSchedOpen(false)} onSaved={() => { setSchedOpen(false); refresh(); }} />}
    </div>
  );
}

function LogDialog({ machineId, technicianRate, onClose, onSaved }) {
  const [f, setF] = useState({ type: "service", title: "", description: "", supplier: "", part_number: "", cost: 0, date: new Date().toISOString().slice(0, 10), cleaning_minutes: 30, cleaning_rate: technicianRate });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isClean = f.type === "cleaning";
  const cleaningCost = ((f.cleaning_minutes || 0) / 60) * (f.cleaning_rate || 0);

  const save = async () => {
    setSaving(true);
    try {
      let invoice_file_id = "", invoice_filename = "";
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        const { data } = await api.post("/upload/invoice", fd, { headers: { "Content-Type": "multipart/form-data" } });
        invoice_file_id = data.file_id; invoice_filename = data.filename;
      }
      await api.post(`/machines/${machineId}/logs`, {
        type: f.type, title: f.title, description: f.description, supplier: f.supplier, part_number: f.part_number,
        cost: Number(f.cost || 0), date: f.date,
        cleaning_minutes: isClean ? Number(f.cleaning_minutes || 0) : 0,
        cleaning_rate: isClean ? Number(f.cleaning_rate || 0) : 0,
        invoice_file_id, invoice_filename,
      });
      toast.success("Entry added"); onSaved();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="log-dialog">
        <DialogHeader><DialogTitle>Add maintenance entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Type</Label>
              <Select value={f.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger className="rounded-lg mt-1" data-testid="log-type"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className="rounded-lg mt-1" data-testid="log-date" /></div>
          </div>
          <div><Label className="text-xs">Title</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Printhead replacement" className="rounded-lg mt-1" data-testid="log-title" /></div>

          {isClean ? (
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 space-y-3" data-testid="cleaning-block">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1"><Clock size={13} /> Cleaning time</Label>
                <span className="num text-sm font-semibold">{f.cleaning_minutes} min</span>
              </div>
              <Slider value={[f.cleaning_minutes]} min={5} max={180} step={5} onValueChange={(v) => set("cleaning_minutes", v[0])} data-testid="cleaning-slider" />
              <div className="flex flex-wrap gap-1.5">
                {TIME_PRESETS.map((p) => (
                  <button key={p} onClick={() => set("cleaning_minutes", p)} data-testid={`cleaning-preset-${p}`}
                    className={`text-xs rounded-full px-2.5 py-0.5 border ${f.cleaning_minutes === p ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white border-slate-200 text-slate-500"}`}>{p}m</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1"><Label className="text-[11px]">Technician rate ($/hr)</Label><Input type="number" value={f.cleaning_rate} onChange={(e) => set("cleaning_rate", e.target.value)} className="rounded-lg mt-1 h-8" data-testid="cleaning-rate" /></div>
                <div className="text-right"><div className="text-[11px] text-slate-400">Labor cost</div><div className="num text-lg font-bold text-emerald-600" data-testid="cleaning-cost">{money(cleaningCost)}</div></div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Cost (CAD)</Label><Input type="number" value={f.cost} onChange={(e) => set("cost", e.target.value)} className="rounded-lg mt-1" data-testid="log-cost" /></div>
              <div><Label className="text-xs">Supplier</Label><Input value={f.supplier} onChange={(e) => set("supplier", e.target.value)} className="rounded-lg mt-1" data-testid="log-supplier" /></div>
              <div><Label className="text-xs">Part #</Label><Input value={f.part_number} onChange={(e) => set("part_number", e.target.value)} className="rounded-lg mt-1" data-testid="log-partnum" /></div>
            </div>
          )}

          <div>
            <Label className="text-xs flex items-center gap-1"><Upload size={13} /> Invoice / receipt (optional)</Label>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-lg mt-1" data-testid="log-invoice-file" />
            {file && <span className="text-[11px] text-slate-500">{file.name}</span>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="log-save">{saving ? "Saving…" : "Save entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ machineId, onClose, onSaved }) {
  const [f, setF] = useState({ part_name: "", recurring: true, interval_months: 3, last_done: new Date().toISOString().slice(0, 10), next_due: "", est_cost: 0, notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.part_name) { toast.error("Part name required"); return; }
    setSaving(true);
    try {
      await api.post(`/machines/${machineId}/schedules`, {
        part_name: f.part_name, recurring: f.recurring, interval_months: Number(f.interval_months || 0),
        last_done: f.recurring ? f.last_done : "", next_due: f.recurring ? "" : f.next_due,
        est_cost: Number(f.est_cost || 0), notes: f.notes,
      });
      toast.success("Part scheduled"); onSaved();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="schedule-dialog">
        <DialogHeader><DialogTitle>Add scheduled part</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Part / task name</Label><Input value={f.part_name} onChange={(e) => set("part_name", e.target.value)} placeholder="e.g. Wiper blade, filter, full service" className="rounded-lg mt-1" data-testid="sched-name" /></div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <Switch checked={f.recurring} onCheckedChange={(v) => set("recurring", v)} data-testid="sched-recurring" />
            <div className="flex-1">
              <Label className="text-xs">Recurring replacement</Label>
              <div className="text-[11px] text-slate-400">Turn off for parts that are one-time or replaced rarely.</div>
            </div>
          </div>
          {f.recurring ? (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Every</Label>
                <Select value={String(f.interval_months)} onValueChange={(v) => set("interval_months", Number(v))}>
                  <SelectTrigger className="rounded-lg mt-1" data-testid="sched-interval"><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 6, 12, 24].map((n) => <SelectItem key={n} value={String(n)}>{n} month{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Last done</Label><Input type="date" value={f.last_done} onChange={(e) => set("last_done", e.target.value)} className="rounded-lg mt-1" data-testid="sched-lastdone" /></div>
            </div>
          ) : (
            <div><Label className="text-xs">Due date</Label><Input type="date" value={f.next_due} onChange={(e) => set("next_due", e.target.value)} className="rounded-lg mt-1" data-testid="sched-nextdue" /></div>
          )}
          <div><Label className="text-xs">Estimated cost (CAD)</Label><Input type="number" value={f.est_cost} onChange={(e) => set("est_cost", e.target.value)} className="rounded-lg mt-1" data-testid="sched-cost" /></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} className="rounded-lg mt-1" rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="sched-save">{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
