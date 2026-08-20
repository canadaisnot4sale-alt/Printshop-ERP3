import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Printer, FileText, CreditCard, Upload, Download, RefreshCw, Trash2 } from "lucide-react";
import { apiErr, API } from "@/lib/api";

const STATUS = { pending: "bg-amber-100 text-amber-700", paid: "bg-blue-100 text-blue-700", received: "bg-indigo-100 text-indigo-700", in_production: "bg-purple-100 text-purple-700", ready: "bg-teal-100 text-teal-700", fulfilled: "bg-emerald-100 text-emerald-700", completed: "bg-emerald-100 text-emerald-700", cancelled: "bg-slate-100 text-slate-500" };
const STATUS_LIST = ["pending", "paid", "received", "in_production", "ready", "completed", "cancelled"];
const STAGES = [["paid", "Received"], ["in_production", "In production"], ["ready", "Ready"], ["completed", "Completed"]];

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);
  const [paying, setPaying] = useState(null);
  const [machines, setMachines] = useState([]);
  const [ink, setInk] = useState({ machine_id: "", area_sqft: "", coverage_pct: 100 });
  const [pnl, setPnl] = useState(null);

  const load = () => api.get("/orders").then(({ data }) => setOrders(data));
  useEffect(() => { load(); if (isAdmin) api.get("/machines").then(({ data }) => setMachines(data)).catch(() => {}); }, []);

  const loadPnl = (id) => api.get(`/orders/${id}/pnl`).then(({ data }) => setPnl(data)).catch(() => setPnl(null));
  useEffect(() => {
    if (detail && isAdmin) { setPnl(null); loadPnl(detail.id); } else setPnl(null);
  }, [detail?.id]);

  const deductInk = async () => {
    if (!ink.machine_id || !ink.area_sqft) { toast.error("Pick a machine and enter the area (ft²)"); return; }
    try {
      const { data } = await api.post(`/orders/${detail.id}/deduct-ink`, { machine_id: ink.machine_id, area_sqft: Number(ink.area_sqft), coverage_pct: Number(ink.coverage_pct) });
      toast.success(`Deducted ${data.ml} ml of ink`);
      setDetail({ ...detail, ink_deducted: { ml: data.ml, cost: data.cost, lines: data.lines } });
      loadPnl(detail.id);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };

  const pay = async (order) => {
    setPaying(order.id);
    try {
      const { data } = await api.post("/payments/checkout", { order_id: order.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); setPaying(null); }
  };

  const setStatus = async (id, status) => { await api.put(`/orders/${id}/status`, { status }); load(); if (detail?.id === id) setDetail({ ...detail, status }); };

  const token = localStorage.getItem("pns_token");
  const fileUrl = (fid) => `${API}/files/${fid}/download?auth=${token}`;
  const uploadFile = async (e, kind) => {
    const file = e.target.files?.[0]; if (!file || !detail) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (kind === "client" && data.pdf_width_in) {
        const tmpl = (detail.items || []).map((i) => i.template).find(Boolean);
        if (tmpl) {
          const ok = (Math.abs(data.pdf_width_in - tmpl.width_in) < 0.15 && Math.abs(data.pdf_height_in - tmpl.height_in) < 0.15)
            || (Math.abs(data.pdf_width_in - tmpl.height_in) < 0.15 && Math.abs(data.pdf_height_in - tmpl.width_in) < 0.15);
          if (!ok) toast.warning(`Your PDF is ${data.pdf_width_in}"×${data.pdf_height_in}" but the template expects ~${tmpl.width_in}"×${tmpl.height_in}" (with bleed). We may need to adjust it — a setup fee could apply.`, { duration: 8000 });
          else toast.success("PDF size matches the template ✓");
        }
      }
      const { data: order } = await api.post(`/orders/${detail.id}/files`, { file_id: data.file_id, kind });
      setDetail(order); load(); toast.success("File uploaded");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
    e.target.value = "";
  };
  const removeFile = async (fid) => {
    const { data: order } = await api.delete(`/orders/${detail.id}/files/${fid}`);
    setDetail(order); load();
  };
  const reorder = async (o) => {
    try {
      await api.post("/orders", { items: (o.items || []).map((i) => ({ product_id: i.product_id, qty: i.qty, config: i.config || null })), notes: `Reorder of ${o.id.slice(-6)}` });
      toast.success("Reorder created"); load(); setDetail(null);
    } catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
  };

  return (
    <div data-testid="orders-page">
      <PageHeader title={isAdmin ? "Orders" : "My Orders"} eyebrow="Shop"
        subtitle={isAdmin ? "All customer orders. Update status and view invoices." : "Your order history and invoices."} />
      <div className="p-8">
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <th className="text-left px-4 py-2.5">Date</th>
                {isAdmin && <th className="text-left px-4 py-2.5">Customer</th>}
                <th className="text-left px-4 py-2.5">Items</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-center px-4 py-2.5">Status</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid="order-row" className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 num text-slate-500">{(o.created_at || "").slice(0, 10)}</td>
                  {isAdmin && <td className="px-4 py-2.5">{o.customer_name}<div className="text-[11px] text-slate-400">{o.role}</div></td>}
                  <td className="px-4 py-2.5">{o.items?.length} item(s)</td>
                  <td className="px-4 py-2.5 text-right num font-semibold text-[#2495D3]">{money(o.total)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge className={`${STATUS[o.status] || "bg-slate-100"} border-0 text-[10px]`} data-testid="order-status">{o.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {o.status === "pending" && (
                      <button onClick={() => pay(o)} disabled={paying === o.id} className="p-1.5 text-slate-400 hover:text-emerald-600 mr-1" title="Pay now" data-testid="order-pay"><CreditCard size={15} /></button>
                    )}
                    <button onClick={() => setDetail(o)} className="p-1.5 text-slate-400 hover:text-[#2495D3]" data-testid="order-view"><FileText size={15} /></button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-slate-400">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="rounded-xl max-w-lg" data-testid="invoice-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Invoice</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">{detail?.customer_name} · {(detail?.created_at || "").slice(0, 10)}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3" id="invoice-print">
              {!isAdmin && detail.status !== "cancelled" && (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3" data-testid="order-stepper">
                  {STAGES.map(([key, label], i) => {
                    const idx = STAGES.findIndex(([k]) => k === detail.status);
                    const done = idx >= i && idx >= 0;
                    return (
                      <div key={key} className="flex-1 text-center">
                        <div className={`mx-auto w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? "bg-[#2495D3] text-white" : "bg-slate-200 text-slate-400"}`}>{i + 1}</div>
                        <div className={`text-[10px] mt-1 ${done ? "text-[#2495D3] font-semibold" : "text-slate-400"}`}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-1.5">Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th>
                </tr></thead>
                <tbody>
                  {detail.items?.map((i, idx) => (
                    <tr key={idx} className="border-b border-slate-50">
                      <td className="py-1.5">{i.name}</td>
                      <td className="text-right num">{i.qty}</td>
                      <td className="text-right num">{money(i.unit_price)}</td>
                      <td className="text-right num">{money(i.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between font-bold pt-1"><span>Total</span><span className="num text-[#2495D3]">{money(detail.total)}</span></div>
              {detail.notes && <div className="text-xs text-slate-500">Notes: {detail.notes}</div>}

              <div className="border-t border-slate-100 pt-3" data-testid="order-files">
                <div className="font-mono uppercase text-[10px] text-slate-400 mb-2">Production files</div>
                <div className="space-y-1">
                  {(detail.files || []).map((f) => (
                    <div key={f.file_id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5" data-testid="order-file-row">
                      <span className="truncate">
                        <span className={`inline-block text-[9px] font-mono uppercase mr-2 px-1.5 py-0.5 rounded ${f.kind === "proof" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{f.kind === "proof" ? "Our file" : "Client"}</span>
                        {f.filename}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <a href={fileUrl(f.file_id)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#2495D3]" title="Download" data-testid="order-file-download"><Download size={14} /></a>
                        <button onClick={() => removeFile(f.file_id)} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
                      </span>
                    </div>
                  ))}
                  {(detail.files || []).length === 0 && <div className="text-[11px] text-slate-400">No files uploaded yet.</div>}
                </div>
                <div className="flex gap-2 mt-2 print:hidden">
                  <label className="text-xs inline-flex items-center gap-1 cursor-pointer text-[#2495D3] hover:underline" data-testid="order-upload-client">
                    <Upload size={13} /> Upload my artwork
                    <input type="file" className="hidden" onChange={(e) => uploadFile(e, "client")} />
                  </label>
                  {isAdmin && (
                    <label className="text-xs inline-flex items-center gap-1 cursor-pointer text-blue-600 hover:underline" data-testid="order-upload-proof">
                      <Upload size={13} /> Upload production file
                      <input type="file" className="hidden" onChange={(e) => uploadFile(e, "proof")} />
                    </label>
                  )}
                </div>
              </div>
              {isAdmin && pnl && (
                <div className="rounded-lg border border-slate-200 p-3 print:hidden" data-testid="order-pnl-panel">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">Ganancia: cotizada vs real</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <div className="text-[10px] uppercase text-slate-400">Margen cotizado</div>
                      <div className={`num text-lg font-black ${!pnl.quoted_known ? "text-slate-300" : pnl.quoted_margin >= 0 ? "text-slate-800" : "text-red-600"}`} data-testid="pnl-quoted">{pnl.quoted_known ? money(pnl.quoted_margin) : "—"}</div>
                      <div className="text-[11px] text-slate-400">{pnl.quoted_known ? `costo BoM ${money(pnl.quoted_cost)} · ${pnl.quoted_margin_pct}%` : "sin BoM"}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2.5">
                      <div className="text-[10px] uppercase text-emerald-600/70">Margen real</div>
                      <div className={`num text-lg font-black ${pnl.real_margin >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="pnl-real">{money(pnl.real_margin)}</div>
                      <div className="text-[11px] text-slate-500">{pnl.real_known ? `mat ${money(pnl.material_cost)} + tinta ${money(pnl.ink_cost)} · ${pnl.real_margin_pct}%` : "sin consumo registrado"}</div>
                    </div>
                  </div>
                  {pnl.quoted_known && pnl.real_known && pnl.variance != null && (
                    <div className={`text-xs mt-2 ${pnl.variance >= 0 ? "text-emerald-600" : "text-amber-600"}`} data-testid="pnl-variance">
                      {pnl.variance >= 0
                        ? `✓ Ganaste ${money(pnl.variance)} más de lo cotizado`
                        : `⚠️ Ganaste ${money(Math.abs(pnl.variance))} menos de lo cotizado`}
                    </div>
                  )}
                </div>
              )}
              {isAdmin && detail.inventory_deductions?.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs" data-testid="order-deductions">
                  <div className="font-mono uppercase text-[10px] text-slate-400 mb-1">Inventory deducted</div>
                  {detail.inventory_deductions.map((d, i) => (
                    <div key={i} className="flex justify-between">
                      <span className={d.short ? "text-red-600" : "text-slate-600"}>{d.material_name}</span>
                      <span className="num">{d.used} + {d.waste} waste = {d.total} {d.unit} → stock {d.new_stock}{d.short ? " ⚠" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <div className="rounded-lg border border-slate-200 p-3 print:hidden" data-testid="ink-deduct-panel">
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">Ink used (deduct when in production)</div>
              {detail?.ink_deducted ? (
                <div className="text-xs text-emerald-600" data-testid="ink-deducted-note">✓ Ink deducted: {detail.ink_deducted.ml} ml</div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={ink.machine_id} onValueChange={(v) => setInk({ ...ink, machine_id: v })}>
                    <SelectTrigger className="rounded-lg h-9 w-44" data-testid="ink-machine"><SelectValue placeholder="Machine" /></SelectTrigger>
                    <SelectContent>{machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <input type="number" value={ink.area_sqft} onChange={(e) => setInk({ ...ink, area_sqft: e.target.value })} placeholder="Area ft²" data-testid="ink-area"
                    className="rounded-lg h-9 w-24 border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2495D3]" />
                  <Select value={String(ink.coverage_pct)} onValueChange={(v) => setInk({ ...ink, coverage_pct: Number(v) })}>
                    <SelectTrigger className="rounded-lg h-9 w-28" data-testid="ink-coverage"><SelectValue /></SelectTrigger>
                    <SelectContent>{[25, 50, 75, 100].map((c) => <SelectItem key={c} value={String(c)}>{c}% coverage</SelectItem>)}</SelectContent>
                  </Select>
                  <Button onClick={deductInk} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-9" data-testid="ink-deduct-btn">Deduct ink</Button>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between items-center pt-2 print:hidden">
            {isAdmin ? (
              <Select value={detail?.status} onValueChange={(v) => setStatus(detail.id, v)}>
                <SelectTrigger className="rounded-lg w-40 h-9" data-testid="order-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_LIST.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => reorder(detail)} className="rounded-lg" data-testid="order-reorder"><RefreshCw size={15} className="mr-1.5" /> Reorder</Button>
              {detail?.status === "pending" && (
                <Button onClick={() => pay(detail)} disabled={paying === detail.id} className="bg-emerald-600 hover:bg-emerald-700 rounded-lg" data-testid="invoice-pay">
                  <CreditCard size={15} className="mr-1.5" /> {paying === detail.id ? "Redirecting…" : "Pay now"}
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()} className="rounded-lg" data-testid="invoice-print"><Printer size={15} className="mr-1.5" /> Print</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
