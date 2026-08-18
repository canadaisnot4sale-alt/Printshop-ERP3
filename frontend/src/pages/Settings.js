import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";

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
  {
    title: "DTF / Apparel",
    fields: [
      { name: "dtf_per_sqft", label: "DTF / ft² (CAD)" },
      { name: "dtf_labor_per_shirt", label: "Labor / shirt (CAD)" },
      { name: "dtf_roll_width", label: "DTF roll width (in)" },
    ],
  },
  {
    title: "Embroidery",
    fields: [
      { name: "embroidery_per_1000_stitches", label: "Per 1,000 stitches (CAD)" },
      { name: "embroidery_digitizing_1_3", label: "Digitizing (1–3 logos) (CAD)" },
    ],
  },
  {
    title: "Laser",
    fields: [
      { name: "laser_cut_per_linear_ft", label: "Cut / linear ft (CAD)" },
      { name: "laser_engraving_per_sqin", label: "Engraving / in² (CAD)" },
      { name: "laser_setup", label: "Laser setup (CAD)" },
    ],
  },
  {
    title: "Direct Print & CNC",
    fields: [
      { name: "directprint_per_sqft", label: "UV print / ft² (CAD)" },
      { name: "cnc_cut_per_linear_ft", label: "CNC cut / linear ft (CAD)" },
    ],
  },
  {
    title: "Channel Letters",
    fields: [
      { name: "channel_return_depth_in", label: "Return depth (in)" },
      { name: "channel_fixture_margin_in", label: "Fixture margin per side (in)" },
      { name: "channel_letter_labor", label: "Labor / letter (CAD)" },
    ],
  },
  {
    title: "Sticker Finishing",
    fields: [
      { name: "sticker_kisscut_per_sqft", label: "Kiss-cut / ft² (CAD)" },
      { name: "sticker_diecut_per_sqft", label: "Die-cut / ft² (CAD)" },
      { name: "sticker_individual_cut_per_piece", label: "Individual cut / piece (CAD)" },
      { name: "sticker_laminate_per_sqft", label: "Lamination / ft² (CAD)" },
    ],
  },
  {
    title: "Sublimation (F570)",
    fields: [
      { name: "sublimation_paper_width", label: "Paper roll width (in)" },
      { name: "sublimation_paper_length_ft", label: "Paper roll length (ft)" },
      { name: "sublimation_paper_roll_cost", label: "Paper roll cost (CAD)" },
      { name: "sublimation_ink_per_sqft", label: "Ink / ft² (CAD)" },
      { name: "sublimation_labor_per_unit", label: "Labor / unit (CAD)" },
    ],
  },
  {
    title: "Roll Stickers (C6000A)",
    fields: [
      { name: "rollsticker_waste_pieces", label: "Waste pieces / job" },
      { name: "rollsticker_cleaning_cost", label: "Ink cleaning / job (CAD)" },
      { name: "rollsticker_ink_per_sticker", label: "Ink / sticker (CAD)" },
      { name: "rollsticker_labor", label: "Labor / job (CAD)" },
      { name: "rollsticker_stickers_per_min", label: "Stickers / minute" },
    ],
  },
  {
    title: "Maintenance & Labor",
    fields: [
      { name: "technician_hourly_rate", label: "Technician hourly rate (CAD/hr)" },
    ],
  },
];

const MODULES_VD = [
  { k: "default", l: "Default (all modules)" },
  { k: "paper", l: "Paper Printing" },
  { k: "booklet", l: "Booklets" },
  { k: "large-format", l: "Large Format" },
  { k: "stickers", l: "Stickers" },
  { k: "dtf", l: "DTF / Apparel" },
  { k: "embroidery", l: "Embroidery" },
  { k: "laser", l: "Laser" },
  { k: "direct-print", l: "Direct Print & CNC" },
  { k: "channel-letters", l: "Channel Letters" },
  { k: "sublimation", l: "Sublimation" },
  { k: "roll-stickers", l: "Roll Stickers" },
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [vdModule, setVdModule] = useState("default");

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);

  const save = async () => {
    try {
      const payload = { ...s };
      Object.keys(payload).forEach((k) => { if (typeof payload[k] === "string" && k !== "currency") payload[k] = Number(payload[k]); });
      if (Array.isArray(payload.volume_discounts)) payload.volume_discounts = payload.volume_discounts.map((r) => ({ qty: Number(r.qty) || 0, pct: Number(r.pct) || 0 }));
      if (payload.volume_discounts_by_module && typeof payload.volume_discounts_by_module === "object") {
        const m = {}; Object.entries(payload.volume_discounts_by_module).forEach(([k, arr]) => { m[k] = (arr || []).map((r) => ({ qty: Number(r.qty) || 0, pct: Number(r.pct) || 0 })); }); payload.volume_discounts_by_module = m;
      }
      const { data } = await api.put("/settings", payload);
      setS(data);
      toast.success("Settings saved — all quotes now use these values");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  if (!s) return null;

  const vdMap = s.volume_discounts_by_module || {};
  const vd = vdMap[vdModule] || [];
  const writeVd = (arr) => setS({ ...s, volume_discounts_by_module: { ...vdMap, [vdModule]: arr } });
  const setVD = (i, key, val) => writeVd(vd.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const addVD = () => writeVd([...vd, { qty: 0, pct: 0 }]);
  const removeVD = (i) => writeVd(vd.filter((_, idx) => idx !== i));
  const copyDefault = () => writeVd((vdMap.default || []).map((r) => ({ ...r })));
  const usingDefault = vdModule !== "default" && vd.length === 0;

  return (
    <div data-testid="settings-page">
      <PageHeader title="Settings" subtitle="Global pricing — changes flow through every module">
        <Button data-testid="save-settings-button" onClick={save} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
          <Save size={16} className="mr-2" />Save
        </Button>
      </PageHeader>
      <div className="p-8 max-w-4xl space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
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

        <div className="bg-white border border-slate-200 rounded-sm p-6" data-testid="volume-discounts-card">
          <div className="flex items-center justify-between mb-1 gap-3">
            <h3 className="font-head font-bold">Volume Discounts</h3>
            <div className="flex items-center gap-2">
              <select data-testid="vd-module-select" value={vdModule} onChange={(e) => setVdModule(e.target.value)} className="text-xs border border-slate-200 rounded-sm h-8 px-2 bg-white">
                {MODULES_VD.map((m) => <option key={m.k} value={m.k}>{m.l}</option>)}
              </select>
              <Button data-testid="vd-add" onClick={addVD} variant="outline" className="rounded-sm h-8 text-xs"><Plus size={14} className="mr-1" />Add tier</Button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">Buy more → cheaper. The highest tier whose quantity ≤ order quantity applies — to Retail and Wholesale. Set tiers <b>per module</b>; a module with no tiers uses <b>Default</b>. Edit both the quantities and the %.</p>
          {vdModule !== "default" && <div className="mb-3"><Button data-testid="vd-copy-default" onClick={copyDefault} variant="ghost" className="h-7 text-xs text-[#2495D3]">Copy Default tiers as a starting point</Button></div>}
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] font-mono uppercase text-slate-400"><th className="text-left py-1">Quantity ≥</th><th className="text-left py-1">Discount %</th><th /></tr></thead>
            <tbody>
              {vd.map((r, i) => (
                <tr key={i} data-testid="vd-row">
                  <td className="py-1 pr-3"><Input data-testid="vd-qty" type="number" value={r.qty} onChange={(e) => setVD(i, "qty", e.target.value)} className="rounded-sm w-32 num" /></td>
                  <td className="py-1 pr-3"><Input data-testid="vd-pct" type="number" step="0.5" value={r.pct} onChange={(e) => setVD(i, "pct", e.target.value)} className="rounded-sm w-28 num" /></td>
                  <td className="py-1 text-right"><button data-testid="vd-remove" onClick={() => removeVD(i)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {vd.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400 text-xs">{usingDefault ? "No custom tiers — this module uses the Default tiers." : "No tiers — add one to enable volume discounts."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
