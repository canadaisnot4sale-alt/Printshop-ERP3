import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Metric } from "@/components/Metric";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Truck, PackageX, Mail } from "lucide-react";

const buildBody = (g, qtys) => {
  const rows = g.items.map((it) => {
    const q = qtys[it.id] ?? it.suggested_qty;
    return `  • ${it.name}${it.code ? ` (${it.code})` : ""} — ${q} ${it.unit}`;
  }).join("\n");
  return `Hello ${g.supplier_contact || g.supplier_company || "there"},

We would like to place a reorder for the following items:

${rows}

Please confirm availability, pricing and lead time.

Thank you,
Print and Save`;
};

export default function ReorderCenter() {
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [qtys, setQtys] = useState({});
  const [compose, setCompose] = useState({ recipient_email: "", subject: "", body_html: "" });
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await api.get("/materials/reorder");
    setGroups(data);
    const q = {};
    data.forEach((g) => g.items.forEach((it) => (q[it.id] = it.suggested_qty)));
    setQtys(q);
  };
  useEffect(() => { load(); }, []);

  const openCompose = (g) => {
    setActive(g);
    setCompose({
      recipient_email: g.supplier_email || "",
      subject: `Reorder request — Print and Save (${g.supplier_company || "supplier"})`,
      body_html: buildBody(g, qtys),
    });
    setOpen(true);
  };

  const send = async () => {
    if (!compose.recipient_email) return toast.error("Recipient email required");
    setSending(true);
    try {
      await api.post("/materials/reorder/email", {
        recipient_email: compose.recipient_email,
        subject: compose.subject,
        body_html: `<pre style="font-family:inherit;white-space:pre-wrap">${compose.body_html}</pre>`,
        material_ids: active.items.map((it) => it.id),
      });
      toast.success(`Reorder emailed to ${compose.recipient_email}`);
      setOpen(false);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setSending(false); }
  };

  const totalItems = groups.reduce((a, g) => a + g.items.length, 0);
  const estCost = groups.reduce((a, g) => a + g.items.reduce((s, it) => s + (qtys[it.id] ?? it.suggested_qty) * (it.unit_cost || 0), 0), 0);

  return (
    <div data-testid="reorder-center-page">
      <PageHeader title="Reorder Center" eyebrow="Business Control"
        subtitle="Materials below their reorder point, grouped by supplier — send a 1-click editable reorder email." />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric icon={Truck} label="Suppliers to reorder" value={groups.length} accent={groups.length > 0} />
          <Metric icon={PackageX} label="Low-stock items" value={totalItems} />
          <Metric icon={Mail} label="Est. reorder cost" value={money(estCost)} />
        </div>

        {groups.length === 0 && (
          <div data-testid="reorder-empty" className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400">
            All materials are above their reorder points. 🎉
          </div>
        )}

        {groups.map((g, gi) => (
          <div key={gi} data-testid="reorder-supplier-card" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-head font-bold">{g.supplier_company || "Unknown supplier"}</div>
                <div className="text-[11px] text-slate-400">{g.supplier_contact}{g.supplier_email ? ` · ${g.supplier_email}` : ""}{g.supplier_phone ? ` · ${g.supplier_phone}` : ""}</div>
              </div>
              <Button data-testid="reorder-email-button" onClick={() => openCompose(g)} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
                <Mail size={15} className="mr-1" /> Email reorder
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  <th className="text-left px-5 py-2">Material</th>
                  <th className="text-right px-5 py-2">Stock</th>
                  <th className="text-right px-5 py-2">Reorder pt</th>
                  <th className="text-right px-5 py-2">Target</th>
                  <th className="text-right px-5 py-2">Order qty</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.id} data-testid="reorder-item-row" className="border-b border-slate-50">
                    <td className="px-5 py-2.5">{it.name} <span className="text-[11px] text-slate-400">{it.code}</span></td>
                    <td className="px-5 py-2.5 text-right num text-red-600">{it.stock_qty}</td>
                    <td className="px-5 py-2.5 text-right num text-slate-400">{it.reorder_point}</td>
                    <td className="px-5 py-2.5 text-right num text-slate-400">{it.reorder_target}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Input type="number" data-testid="reorder-qty-input" value={qtys[it.id] ?? it.suggested_qty}
                        onChange={(e) => setQtys((q) => ({ ...q, [it.id]: Number(e.target.value) }))}
                        className="rounded-lg w-24 ml-auto text-right num h-8" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl max-w-xl" data-testid="reorder-compose-dialog">
          <DialogHeader><DialogTitle className="font-head">Reorder email</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div><Label className="text-xs">To</Label>
              <Input data-testid="reorder-recipient" value={compose.recipient_email} onChange={(e) => setCompose({ ...compose, recipient_email: e.target.value })} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Subject</Label>
              <Input data-testid="reorder-subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Message</Label>
              <Textarea data-testid="reorder-body" rows={12} value={compose.body_html} onChange={(e) => setCompose({ ...compose, body_html: e.target.value })} className="rounded-lg mt-1 font-mono text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancel</Button>
            <Button data-testid="reorder-send-button" onClick={send} disabled={sending} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">
              {sending ? "Sending…" : "Send email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
