import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save } from "lucide-react";

const GROUPS = [
  {
    title: "Markups",
    fields: [
      { name: "retail_markup_pct", label: "Retail Markup %" },
      { name: "wholesale_markup_pct", label: "Wholesale Markup %" },
    ],
  },
  {
    title: "Paper Click Charges & Lamination",
    fields: [
      { name: "click_4_0", label: "4/0 Click / sheet (CAD)" },
      { name: "click_4_4", label: "4/4 Click / sheet (CAD)" },
      { name: "lamination_per_sheet", label: "Lamination / sheet (CAD)" },
    ],
  },
  {
    title: "Large Format Pricing",
    fields: [
      { name: "lf_print_per_sqft", label: "Print / sqft (CAD)" },
      { name: "lf_lamination_per_sqft", label: "Lamination / sqft (CAD)" },
      { name: "lf_diecut_transfer_per_sqft", label: "Die-Cut + Transfer / sqft (CAD)" },
      { name: "tiling_overlap_in", label: "Tiling Overlap (in)" },
    ],
  },
  {
    title: "Booklet Binding",
    fields: [
      { name: "binding_saddle", label: "Saddle Stitch (CAD)" },
      { name: "binding_spiral", label: "Spiral (CAD)" },
      { name: "binding_wireo", label: "Wire-O (CAD)" },
      { name: "binding_perfect", label: "Perfect Binding (CAD)" },
      { name: "binding_per_page", label: "Per Page Add (CAD)" },
    ],
  },
];

export default function Settings() {
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);

  const save = async () => {
    try {
      const payload = { ...s };
      Object.keys(payload).forEach((k) => { if (typeof payload[k] === "string" && k !== "currency") payload[k] = Number(payload[k]); });
      const { data } = await api.put("/settings", payload);
      setS(data);
      toast.success("Settings saved — all quotes now use these values");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  if (!s) return null;

  return (
    <div data-testid="settings-page">
      <PageHeader title="Settings" subtitle="Global pricing — changes flow through every module">
        <Button data-testid="save-settings-button" onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
          <Save size={16} className="mr-2" />Save
        </Button>
      </PageHeader>
      <div className="p-8 grid md:grid-cols-2 gap-6 max-w-4xl">
        {GROUPS.map((g) => (
          <div key={g.title} className="bg-white border border-slate-200 rounded-sm p-6">
            <h3 className="font-head font-bold mb-4">{g.title}</h3>
            <div className="space-y-3">
              {g.fields.map((f) => (
                <div key={f.name} className="flex items-center justify-between gap-4">
                  <Label className="text-xs flex-1">{f.label}</Label>
                  <Input
                    data-testid={`setting-${f.name}`}
                    type="number" step="0.01"
                    value={s[f.name]}
                    onChange={(e) => setS({ ...s, [f.name]: e.target.value })}
                    className="rounded-sm w-32 num text-right"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
