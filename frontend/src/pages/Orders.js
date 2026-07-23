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
import { Printer, FileText } from "lucide-react";

const STATUS = { pending: "bg-amber-100 text-amber-700", paid: "bg-blue-100 text-blue-700", fulfilled: "bg-emerald-100 text-emerald-700", cancelled: "bg-slate-100 text-slate-500" };

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/orders").then(({ data }) => setOrders(data));
  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => { await api.put(`/orders/${id}/status`, { status }); load(); if (detail?.id === id) setDetail({ ...detail, status }); };

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
          <div className="flex justify-between items-center pt-2 print:hidden">
            {isAdmin ? (
              <Select value={detail?.status} onValueChange={(v) => setStatus(detail.id, v)}>
                <SelectTrigger className="rounded-lg w-40 h-9" data-testid="order-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending", "paid", "fulfilled", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <span />}
            <Button variant="outline" onClick={() => window.print()} className="rounded-lg" data-testid="invoice-print"><Printer size={15} className="mr-1.5" /> Print</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
