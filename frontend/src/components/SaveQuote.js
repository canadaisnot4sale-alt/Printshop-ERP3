import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Printer } from "lucide-react";

export function SaveQuoteBar({ module, title, summary, disabled }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.post("/quotes", { module, title, summary });
      toast.success("Cotización guardada");
    } catch (e) {
      toast.error(apiErr(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex gap-2">
      <Button data-testid="save-quote-button" onClick={save} disabled={disabled || saving} variant="outline" className="rounded-sm">
        <Save size={15} className="mr-1.5" /> Guardar
      </Button>
      <Button data-testid="print-quote-button" onClick={() => window.print()} disabled={disabled} variant="outline" className="rounded-sm">
        <Printer size={15} className="mr-1.5" /> PDF / Imprimir
      </Button>
    </div>
  );
}
