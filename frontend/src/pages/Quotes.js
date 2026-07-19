import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Printer } from "lucide-react";

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const load = () => api.get("/quotes").then((r) => setQuotes(r.data));
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await api.delete(`/quotes/${id}`); toast.success("Eliminada"); load(); };

  const priceOf = (s) => s?.retail_total ?? s?.customer_price ?? s?.wholesale_total ?? s?.wholesale_price ??
    s?.results?.[0]?.retail_total ?? s?.results?.[0]?.wholesale_total ??
    s?.total?.selling_price ?? s?.total?.wholesale_price;

  return (
    <div data-testid="quotes-page">
      <PageHeader title="Mis Cotizaciones" subtitle="Cotizaciones guardadas">
        <Button onClick={() => window.print()} variant="outline" className="rounded-sm"><Printer size={15} className="mr-1.5" />PDF</Button>
      </PageHeader>
      <div className="p-8">
        {quotes.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">Aún no hay cotizaciones guardadas. Usa "Guardar" en cualquier calculadora.</div>
        ) : (
          <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Módulo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Descripción</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Cliente</th>
                  <th className="text-right px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Precio</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Fecha</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} data-testid="quote-row" className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5"><span className="text-[10px] font-mono uppercase bg-slate-100 px-2 py-0.5 rounded-sm">{q.module}</span></td>
                    <td className="px-4 py-2.5">{q.title}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{q.user_email}</td>
                    <td className="px-4 py-2.5 text-right num tabular text-[#2495D3] font-semibold">{priceOf(q.summary) != null ? money(priceOf(q.summary)) : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs num">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button data-testid="delete-quote" onClick={() => remove(q.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
