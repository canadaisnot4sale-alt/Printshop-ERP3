import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Minus, Plus, Save, Printer, ShoppingCart } from "lucide-react";

export default function QuoteBuilder() {
  const { items, removeItem, setQty, clear, total } = useCart();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/quotes", {
        module: "Multi-Module",
        title: `Combined quote · ${items.length} item(s)`,
        quote_type: "multi",
        summary: { retail_total: total },
        items: items.map((i) => ({ module: i.module, title: i.title, price: i.price, qty: i.qty })),
        customer_name: customer, customer_email: email, notes,
      });
      toast.success("Combined quote saved");
      setOpen(false); clear(); setCustomer(""); setEmail(""); setNotes("");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="quote-builder-page">
      <PageHeader title="Quote Builder" eyebrow="Multi-Module"
        subtitle="Combine items from any module into a single quote for a client.">
        {items.length > 0 && (
          <>
            <Button variant="outline" onClick={() => window.print()} className="rounded-lg" data-testid="qb-print"><Printer size={15} className="mr-1.5" /> PDF</Button>
            <Button variant="ghost" onClick={clear} className="rounded-lg text-slate-500" data-testid="qb-clear">Clear</Button>
            <Button onClick={() => setOpen(true)} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="qb-save"><Save size={15} className="mr-1.5" /> Save quote</Button>
          </>
        )}
      </PageHeader>

      <div className="p-8">
        {items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400" data-testid="qb-empty">
            <ShoppingCart className="mx-auto mb-3 text-slate-300" size={40} />
            Your quote is empty. Calculate in any module and click <b>“Add to quote”</b>.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-right px-4 py-2.5">Unit price</th>
                  <th className="text-center px-4 py-2.5">Qty</th>
                  <th className="text-right px-4 py-2.5">Line total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} data-testid="qb-item-row" className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium">{i.title}</div>
                      <div className="text-[10px] font-mono uppercase text-slate-400 bg-slate-100 inline-block px-2 py-0.5 rounded mt-1">{i.module}</div>
                    </td>
                    <td className="px-4 py-3 text-right num">{money(i.price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setQty(i.id, i.qty - 1)} className="p-1 text-slate-400 hover:text-red-500" data-testid="qb-qty-minus"><Minus size={13} /></button>
                        <span className="num w-8 text-center font-semibold">{i.qty}</span>
                        <button onClick={() => setQty(i.id, i.qty + 1)} className="p-1 text-slate-400 hover:text-emerald-600" data-testid="qb-qty-plus"><Plus size={13} /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right num font-semibold">{money(i.price * i.qty)}</td>
                    <td className="px-4 py-3"><button onClick={() => removeItem(i.id)} className="p-1 text-slate-400 hover:text-red-500" data-testid="qb-remove"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#2495D3] text-white">
                  <td colSpan={3} className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest">Combined total</td>
                  <td className="px-4 py-3 text-right num text-2xl font-black" data-testid="qb-total">{money(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl" data-testid="qb-save-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Save combined quote</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">{items.length} items · {money(total)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div><Label className="text-xs">Customer name</Label>
              <Input data-testid="qb-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Customer email (optional)</Label>
              <Input data-testid="qb-email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-lg mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="qb-save-confirm" onClick={save} disabled={saving} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Save quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
