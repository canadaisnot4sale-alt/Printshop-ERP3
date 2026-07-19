import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import QuoteDetailDialog from "@/components/QuoteDetailDialog";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Printer, Mail } from "lucide-react";

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = () => api.get("/quotes").then((r) => setQuotes(r.data));
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await api.delete(`/quotes/${id}`); toast.success("Deleted"); load(); };

  const openDetail = (q) => { setDetail(q); setDetailOpen(true); };
  const openEmail = (q) => { setTarget(q); setRecipient(q.customer_email || ""); setEmailOpen(true); };
  const sendEmail = async () => {
    setSending(true);
    try {
      await api.post(`/quotes/${target.id}/email`, { recipient_email: recipient });
      toast.success(`Quote emailed to ${recipient}`);
      setEmailOpen(false); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
    finally { setSending(false); }
  };

  const priceOf = (s) => s?.retail_total ?? s?.customer_price ?? s?.wholesale_total ?? s?.wholesale_price ??
    s?.results?.[0]?.retail_total ?? s?.results?.[0]?.wholesale_total ??
    s?.total?.selling_price ?? s?.total?.wholesale_price ?? s?.selling_price;

  return (
    <div data-testid="quotes-page">
      <PageHeader title="My Quotes" eyebrow="Saved Estimates" subtitle="Click a quote for full details — email or print as PDF">
        <Button onClick={() => window.print()} variant="outline" className="rounded-lg"><Printer size={15} className="mr-1.5" />PDF</Button>
      </PageHeader>
      <div className="p-8">
        {quotes.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">No saved quotes yet. Use "Save" on any calculator.</div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Module</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Description / Notes</th>
                  <th className="text-right px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Price</th>
                  <th className="text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-slate-500">Date</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} data-testid="quote-row" onClick={() => openDetail(q)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3"><span className="text-[10px] font-mono uppercase bg-slate-100 px-2 py-0.5 rounded-md">{q.module}</span></td>
                    <td className="px-4 py-3 font-medium">
                      {q.customer_name || "—"}
                      {q.emailed_to && <span className="block text-[10px] text-green-600 font-mono">✓ emailed</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div>{q.title}</div>
                      {q.notes && <div className="text-xs text-slate-400 mt-0.5">{q.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right num tabular text-[#2495D3] font-semibold">{priceOf(q.summary) != null ? money(priceOf(q.summary)) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs num">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <button data-testid="email-quote" onClick={() => openEmail(q)} className="p-1.5 text-slate-400 hover:text-[#2495D3]" title="Email quote"><Mail size={15} /></button>
                        <button data-testid="delete-quote" onClick={() => remove(q.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuoteDetailDialog quote={detail} open={detailOpen} onOpenChange={setDetailOpen} />

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader><DialogTitle className="font-head">Email quote</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">A branded quote email will be sent to:</p>
          <Label className="text-xs">Recipient email</Label>
          <Input data-testid="email-recipient" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="customer@email.com" className="rounded-lg" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="email-send-confirm" onClick={sendEmail} disabled={sending || !recipient} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
              <Mail size={15} className="mr-1.5" />{sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
