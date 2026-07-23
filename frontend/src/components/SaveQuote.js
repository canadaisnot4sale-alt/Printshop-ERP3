import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Printer, ShoppingCart } from "lucide-react";

const priceOf = (s) => {
  if (!s) return 0;
  const t = s.total || {};
  return s.retail_total ?? s.customer_price ?? s.selling_price ?? t.selling_price ?? s.wholesale_total ?? s.wholesale_price ?? 0;
};

export function SaveQuoteBar({ module, title, summary, inputs, disabled }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const cart = useCart();

  const addToQuote = () => {
    cart.addItem({ module, title, price: Number(priceOf(summary) || 0), summary, inputs: inputs || {} });
    toast.success("Added to quote");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/quotes", { module, title, summary, inputs: inputs || {}, customer_name: customer, customer_email: customerEmail, notes });
      toast.success("Quote saved");
      setOpen(false); setCustomer(""); setCustomerEmail(""); setNotes("");
    } catch (e) {
      toast.error(apiErr(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  return (
    <div className="flex gap-2 print:hidden">
      <Button data-testid="add-to-quote-button" onClick={addToQuote} disabled={disabled} variant="outline" size="sm" className="rounded-sm">
        <ShoppingCart size={15} className="mr-1.5" /> Add to quote
      </Button>
      <Button data-testid="save-quote-button" onClick={() => setOpen(true)} disabled={disabled} variant="outline" size="sm" className="rounded-sm">
        <Save size={15} className="mr-1.5" /> Save
      </Button>
      <Button data-testid="print-quote-button" onClick={() => window.print()} disabled={disabled} variant="outline" size="sm" className="rounded-sm">
        <Printer size={15} className="mr-1.5" /> PDF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-head">Save quote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Customer name</Label>
              <Input data-testid="quote-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. John's Signs Inc." className="rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Customer email (optional — to email the quote later)</Label>
              <Input data-testid="quote-customer-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" className="rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea data-testid="quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes to remember this quote" className="rounded-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancel</Button>
            <Button data-testid="quote-save-confirm" onClick={save} disabled={saving} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">Save quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
