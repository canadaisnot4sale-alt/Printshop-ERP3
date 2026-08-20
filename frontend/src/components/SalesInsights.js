import { useEffect, useState } from "react";
import api from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trophy, TrendingUp, Megaphone, Plus, Copy, Mail, Facebook, MessageCircle, Trash2, Target } from "lucide-react";

const PERIODS = [["day", "Hoy"], ["week", "Semana"], ["month", "Mes"], ["year", "Año"]];

function ProductRow({ r, rank, metric, onPromote }) {
  return (
    <tr data-testid="bestseller-row" className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2.5 text-center num text-slate-400 w-8">{rank}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {r.image_url
            ? <img src={r.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100" />
            : <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 text-xs">—</div>}
          <div>
            <div className="font-medium text-slate-800 leading-tight">{r.name}</div>
            <div className="text-[11px] text-slate-400">{r.category || "—"}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right num text-slate-600">{r.units}</td>
      <td className="px-3 py-2.5 text-right num text-[#2495D3]">{money(r.revenue)}</td>
      <td className="px-3 py-2.5 text-right num font-semibold">
        {r.cost_known
          ? <span className={r.profit >= 0 ? "text-emerald-600" : "text-red-600"}>{money(r.profit)}</span>
          : <span className="text-slate-400" title="Este producto no tiene lista de materiales (BoM), no se puede calcular la ganancia real">— sin costo</span>}
      </td>
      {metric === "profit" && (
        <td className="px-3 py-2.5 text-right">
          {r.times_to_goal
            ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5" data-testid="times-to-goal"><Target size={11} /> ×{r.times_to_goal}</span>
            : <span className="text-[11px] text-slate-300">—</span>}
        </td>
      )}
      <td className="px-3 py-2.5 text-right">
        <button onClick={() => onPromote(r)} data-testid="promote-btn"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2495D3] hover:text-[#1E7AA9]">
          <Megaphone size={13} /> Promocionar
        </button>
      </td>
    </tr>
  );
}

export default function SalesInsights() {
  const [period, setPeriod] = useState("month");
  const [metric, setMetric] = useState("units");
  const [data, setData] = useState(null);
  const [promote, setPromote] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [sale, setSale] = useState({ product_id: "", name: "", qty: 1, unit_price: "", date: "", customer_name: "" });

  const load = () => api.get(`/finance/best-sellers?period=${period}`).then(({ data }) => setData(data)).catch(() => {});
  useEffect(() => { load(); }, [period]);
  useEffect(() => { api.get("/catalog-products").then(({ data }) => setProducts(data || [])).catch(() => {}); }, []);

  const rows = metric === "profit" ? (data?.by_profit || []) : (data?.by_units || []);

  const pickProduct = (id) => {
    const p = products.find((x) => x.id === id);
    setSale((s) => ({ ...s, product_id: id, name: p?.name || s.name, unit_price: p?.price ?? s.unit_price }));
  };

  const saveManual = async () => {
    if (!sale.name || !Number(sale.qty) || sale.unit_price === "") { toast.error("Completa producto, cantidad y precio"); return; }
    try {
      await api.post("/finance/manual-sale", {
        customer_name: sale.customer_name || null,
        date: sale.date || null,
        items: [{ product_id: sale.product_id || null, name: sale.name, qty: Number(sale.qty), unit_price: Number(sale.unit_price) }],
      });
      toast.success("Venta externa registrada");
      setManualOpen(false);
      setSale({ product_id: "", name: "", qty: 1, unit_price: "", date: "", customer_name: "" });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const shareUrl = promote?.product_id ? `${window.location.origin}/store/product/${promote.product_id}` : window.location.origin;
  const shareMsg = promote ? `${promote.share_text}\n\n${shareUrl}` : "";
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(promote?.share_text || "")}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareMsg)}`,
    email: `mailto:?subject=${encodeURIComponent(promote?.name || "")}&body=${encodeURIComponent(shareMsg)}`,
  };
  const copyText = () => { navigator.clipboard?.writeText(shareMsg); toast.success("Texto copiado"); };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="sales-insights-panel">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400">Rentabilidad & más vendidos</div>
          <div className="text-sm text-slate-500">
            {data ? <>Total {data.total_units} u · Ingresos <b className="num">{money(data.total_revenue)}</b> · Ganancia <b className="num text-emerald-600">{money(data.total_profit)}</b></> : "Cargando…"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="rounded-lg h-9 w-28 text-sm" data-testid="bestseller-period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="rounded-lg h-9" onClick={() => setManualOpen(true)} data-testid="manual-sale-btn">
            <Plus size={15} className="mr-1" /> Venta externa
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 mb-3">
        {[["units", "Más vendidos", Trophy], ["profit", "Más rentables", TrendingUp]].map(([v, l, Icon]) => (
          <button key={v} onClick={() => setMetric(v)} data-testid={`metric-${v}`}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${metric === v ? "bg-white text-[#2495D3] shadow-sm" : "text-slate-500"}`}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
              <th className="px-3 py-2.5 w-8">#</th>
              <th className="text-left px-3 py-2.5">Producto</th>
              <th className="text-right px-3 py-2.5">Unidades</th>
              <th className="text-right px-3 py-2.5">Ingresos</th>
              <th className="text-right px-3 py-2.5">Ganancia real</th>
              {metric === "profit" && <th className="text-right px-3 py-2.5" title="Cuántas veces vender para llegar a la meta mensual">Vende ×N → meta</th>}
              <th className="text-right px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => <ProductRow key={(r.product_id || r.name) + i} r={r} rank={i + 1} metric={metric} onPromote={setPromote} />)}
            {rows.length === 0 && <tr><td colSpan={metric === "profit" ? 7 : 6} className="px-4 py-10 text-center text-slate-400">Aún no hay ventas en este periodo.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Promote / share dialog */}
      <Dialog open={!!promote} onOpenChange={(v) => !v && setPromote(null)}>
        <DialogContent className="rounded-xl max-w-md" data-testid="promote-dialog">
          <DialogHeader>
            <DialogTitle className="font-head flex items-center gap-2"><Megaphone size={17} /> Promocionar</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">{promote?.name} · Comparte para vender más</DialogDescription>
          </DialogHeader>
          {promote && (
            <div className="space-y-3">
              {promote.image_url && <img src={promote.image_url} alt="" className="w-full h-40 object-cover rounded-lg border border-slate-100" />}
              <textarea readOnly value={shareMsg} data-testid="promote-text"
                className="w-full h-28 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-600 resize-y overflow-auto focus:outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <a href={shareLinks.facebook} target="_blank" rel="noreferrer" data-testid="share-facebook"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1877F2] text-white text-sm h-9 hover:opacity-90"><Facebook size={15} /> Facebook</a>
                <a href={shareLinks.whatsapp} target="_blank" rel="noreferrer" data-testid="share-whatsapp"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-white text-sm h-9 hover:opacity-90"><MessageCircle size={15} /> WhatsApp</a>
                <a href={shareLinks.email} data-testid="share-email"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-700 text-white text-sm h-9 hover:opacity-90"><Mail size={15} /> Email</a>
                <button onClick={copyText} data-testid="share-copy"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm h-9 hover:bg-slate-50"><Copy size={15} /> Copiar</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual/external sale dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="rounded-xl max-w-md" data-testid="manual-sale-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Registrar venta externa</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Factura fuera del sistema. Suma a metas y más vendidos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono uppercase text-slate-400">Producto del catálogo (opcional)</label>
              <Select value={sale.product_id} onValueChange={pickProduct}>
                <SelectTrigger className="rounded-lg h-9 mt-1" data-testid="manual-product"><SelectValue placeholder="Selecciona o escribe abajo" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-slate-400">Nombre del producto</label>
              <Input value={sale.name} onChange={(e) => setSale({ ...sale, name: e.target.value })} className="rounded-lg mt-1" data-testid="manual-name" placeholder="Ej. Tarjetas de presentación" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400">Cantidad</label>
                <Input type="number" value={sale.qty} onChange={(e) => setSale({ ...sale, qty: e.target.value })} className="rounded-lg mt-1" data-testid="manual-qty" />
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400">Precio unitario</label>
                <Input type="number" value={sale.unit_price} onChange={(e) => setSale({ ...sale, unit_price: e.target.value })} className="rounded-lg mt-1" data-testid="manual-price" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400">Fecha (opcional)</label>
                <Input type="date" value={sale.date} onChange={(e) => setSale({ ...sale, date: e.target.value })} className="rounded-lg mt-1" data-testid="manual-date" />
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400">Cliente (opcional)</label>
                <Input value={sale.customer_name} onChange={(e) => setSale({ ...sale, customer_name: e.target.value })} className="rounded-lg mt-1" data-testid="manual-customer" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" onClick={saveManual} data-testid="manual-save">Registrar venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
