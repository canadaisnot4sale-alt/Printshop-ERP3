import { useEffect, useMemo, useState, Fragment } from "react";
import api, { apiErr } from "@/lib/api";
import { useDefaultSheetSize } from "@/lib/useDefaultSheetSize";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import NestingCanvas from "@/components/NestingCanvas";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ProductImageAI from "@/components/ProductImageAI";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num } from "@/lib/format";
import { PricingPanel, useRushRates } from "@/components/Metric";
import { useRequote } from "@/lib/useRequote";
import { useNavigate } from "react-router-dom";
import { API } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Calculator, Layers, FileStack, DollarSign, Tag, Package, X, Sparkles, Copy } from "lucide-react";

const SHEETS = ["8.5x11", "8.5x14", "11x17", "12x18", "13x19"];
const STD_TIERS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

const prodFields = [
  { name: "name", label: "Product Name", type: "text", full: true },
  { name: "finished_w", label: "Finished W (in)", type: "number", default: 3.5 },
  { name: "finished_h", label: "Finished H (in)", type: "number", default: 2 },
  { name: "bleed_w", label: "Bleed W (in)", type: "number", default: 3.75 },
  { name: "bleed_h", label: "Bleed H (in)", type: "number", default: 2.25 },
  { name: "gutter", label: "Gutter (in)", type: "number", default: 0 },
  { name: "retail_markup_pct", label: "Retail Markup % (override)", type: "number" },
  { name: "wholesale_markup_pct", label: "Wholesale Markup % (override)", type: "number" },
  { name: "is_default", label: "Default product (pre-selected in quotes)", type: "switch", full: true },
];
const prodCols = [
  { name: "name", label: "Product" },
  { name: "finished", label: "Finished", mono: true, render: (i) => `${num(i.finished_w)}" × ${num(i.finished_h)}"` },
  { name: "bleed", label: "With Bleed", mono: true, render: (i) => `${num(i.bleed_w || i.finished_w)}" × ${num(i.bleed_h || i.finished_h)}"` },
  { name: "gutter", label: "Gutter", mono: true, render: (i) => `${num(i.gutter || 0)}"` },
  { name: "is_default", label: "Default", render: (i) => (i.is_default ? <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Default</span> : "—") },
];

function Metric({ icon: Icon, label, value, accent }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-[#2495D3] border-[#2495D3] text-white" : "bg-white border-slate-200"}`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${accent ? "text-white/80" : "text-slate-500"}`}>
        <Icon size={13} /> {label}
      </div>
      <div className={`num text-2xl font-black mt-1.5 ${accent ? "text-white" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

const PAPER_GROUPS = [
  { key: "cardstock", label: "Cardstock", dot: "bg-indigo-500", text: "text-indigo-700", accentL: "border-l-indigo-400" },
  { key: "text", label: "Text", dot: "bg-amber-500", text: "text-amber-700", accentL: "border-l-amber-400" },
  { key: "copy", label: "Copy Paper", dot: "bg-slate-500", text: "text-slate-600", accentL: "border-l-slate-400" },
  { key: "other", label: "Other", dot: "bg-slate-400", text: "text-slate-500", accentL: "border-l-slate-300" },
];
// Classify a paper into a display group from its name (Cover/pt → Cardstock, Copy → Copy Paper, Text/Bond/Book → Text).
const paperClass = (name = "") => {
  const t = String(name).toLowerCase();
  if (/(cover|cardstock|card stock|c2s|c1s|\d+\s*pt\b)/.test(t)) return "cardstock";
  if (/(copy|digital copy)/.test(t)) return "copy";
  if (/(text|book|bond|writing)/.test(t)) return "text";
  return "other";
};

export default function PaperPrinting() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [products, setProducts] = useState([]);
  const rush = useRushRates();
  const retailTaxF = 1 + (rush.gst + rush.pst) / 100;
  const wsTaxF = 1 + rush.gst / 100;
  const [productId, setProductId] = useState("");
  const [sheet, setSheet] = useState("13x19");
  const [laminate, setLaminate] = useState(false);
  const [laminateId, setLaminateId] = useState("");
  const [laminateSides, setLaminateSides] = useState(2);
  const [hotFoil, setHotFoil] = useState(false);
  const [foilId, setFoilId] = useState("");
  const [foilSides, setFoilSides] = useState(2);
  const [roundCorners, setRoundCorners] = useState(false);
  const [lamOptions, setLamOptions] = useState([]);
  const [foilOptions, setFoilOptions] = useState([]);
  const [side, setSide] = useState("4_0");
  const [focusQty, setFocusQty] = useState(100);
  const [selectedStock, setSelectedStock] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [paperMats, setPaperMats] = useState([]);
  const nav = useNavigate();
  const [matches, setMatches] = useState([]);
  const [convOpen, setConvOpen] = useState(false);
  const [convForm, setConvForm] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const loadProducts = () => api.get("/products").then((r) => {
    const list = [...r.data].sort((a, b) => (Number(a.finished_w) * Number(a.finished_h)) - (Number(b.finished_w) * Number(b.finished_h)) || Number(a.finished_w) - Number(b.finished_w));
    setProducts(list);
    if (!productId && list.length) setProductId((list.find((p) => p.is_default) || list[0]).id);
  });
  const loadPaperMats = () => api.get("/materials").then((r) => setPaperMats((r.data || []).filter((m) => (m.modules || []).includes("paper") && (m.paper_type || "normal") === "normal"))).catch(() => {});
  useEffect(() => { loadProducts(); if (isAdmin) loadPaperMats(); /* eslint-disable-next-line */ }, []);
  // Default Sheet Size to the size of this module's DEFAULT paper material (unless re-quoting)
  const canonSheet = (s) => {
    const p = String(s || "").toLowerCase().replace(/["\s]/g, "").replace(/×/g, "x").split("x").map(parseFloat);
    return (p.length === 2 && p.every((n) => !isNaN(n))) ? p.sort((a, b) => a - b).join("x") : s;
  };
  useDefaultSheetSize("/paper-stocks?module=paper", (s) => setSheet(canonSheet(s)), "paper");

  const sheetOpts = [...new Set([...SHEETS, ...(sheet ? [canonSheet(sheet)] : [])])];
  const fmtSheet = (s) => (s ? String(s).replace(/x/i, '"x') + '"' : s);

  useEffect(() => {
    api.get("/paper-addons?type=laminate").then((r) => {
      setLamOptions(r.data);
      const d = r.data.find((o) => o.is_default) || r.data[0];
      if (d) setLaminateId((cur) => cur || d.id);
    }).catch(() => {});
    api.get("/paper-addons?type=hot_foil").then((r) => {
      setFoilOptions(r.data);
      const d = r.data.find((o) => o.is_default) || r.data[0];
      if (d) setFoilId((cur) => cur || d.id);
    }).catch(() => {});
  }, []);

  // Anti-duplicate: if a configurable product already exists for this piece, alert the estimator.
  useEffect(() => {
    if (!isAdmin || !productId) { setMatches([]); return; }
    api.get(`/products/paper-match?product_id=${productId}`).then((r) => setMatches(r.data || [])).catch(() => setMatches([]));
  }, [isAdmin, productId]);

  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const isCustom = sheet === "custom";

  const calc = async (sheetKey = sheet, keepStockId = null) => {
    if (typeof sheetKey !== "string") sheetKey = sheet;   // ignore event arg from onClick
    const custom = sheetKey === "custom";
    if (custom) { if (!Number(customW) || !Number(customH)) return toast.error("Enter custom W and H (in)"); }
    else { sheetKey = canonSheet(sheetKey); if (!productId) return toast.error("Select a product"); }
    setLoading(true);
    try {
      const payload = { product_id: productId || null, sheet_key: sheetKey, laminate, laminate_id: laminate ? (laminateId || null) : null, laminate_sides: laminateSides, foil_id: hotFoil ? (foilId || null) : null, foil_sides: foilSides, round_corners: roundCorners };
      if (custom) { payload.custom_w = Number(customW); payload.custom_h = Number(customH); }
      const { data } = await api.post("/calc/paper", payload);
      setResult(data);
      const rows = data.results || [];
      setSelectedStock((keepStockId && rows.find((r) => r.stock.id === keepStockId)) || rows.find((r) => r.stock.is_default) || rows[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  // Selecting a paper switches the Sheet Size to that paper's size and recalculates its layout.
  const selectStock = (r) => {
    const raw = (r.stock.size || "").toString().trim().toLowerCase().replace(/["\s]/g, "").replace(/×/g, "x");
    const key = /^[\d.]+x[\d.]+$/.test(raw) ? canonSheet(raw) : null;
    if (key && key !== sheet) {
      setSheet(key);
      calc(key, r.stock.id);
    } else {
      setSelectedStock(r);
    }
  };

  useRequote((rq) => {
    if (rq.productId) setProductId(rq.productId);
    if (rq.sheet) setSheet(canonSheet(rq.sheet));
    if (rq.laminate != null) setLaminate(rq.laminate);
    if (rq.laminate_id) setLaminateId(rq.laminate_id);
    if (rq.laminate_sides) setLaminateSides(rq.laminate_sides);
    if (rq.hot_foil != null) setHotFoil(rq.hot_foil);
    if (rq.foil_id) setFoilId(rq.foil_id);
    if (rq.foil_sides) setFoilSides(rq.foil_sides);
    if (rq.side) setSide(rq.side);
    if (rq.focusQty) setFocusQty(rq.focusQty);
  }, calc, { moduleKey: "paper", inputs: { productId, sheet, laminate, laminate_id: laminateId, laminate_sides: laminateSides, hot_foil: hotFoil, foil_id: foilId, foil_sides: foilSides, side, focusQty }, hasResult: !!result });

  // Auto-recalc when add-ons change (once a quote already exists) so toggling Lamination / Hot Foil /
  // Round Corners — or switching the laminate/foil material or sides — updates prices without re-clicking Generate.
  useEffect(() => {
    if (!result || !productId) return;
    const t = setTimeout(() => { calc(sheet, selectedStock?.stock?.id); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laminate, laminateId, laminateSides, hotFoil, foilId, foilSides, roundCorners, customW, customH]);

  const openConvert = () => {
    if (!result || !selectedStock) return;
    const cls = paperClass(selectedStock.stock.name);
    const clsIds = paperMats.filter((m) => paperClass(m.name) === cls).map((m) => m.id);
    setConvForm({
      name: result.product?.name || "Product", category: "Business Cards", description: "", published: true,
      autoByClass: true, paperClass: cls, allowedIds: clsIds.length ? clsIds : paperMats.map((m) => m.id),
      sides: ["4_0", "4_4"], defaultSides: side,
      turnarounds: [
        { id: "standard", label: "Standard", pct: 0 },
        { id: "next_day", label: "Next day", pct: rush.next },
        { id: "same_day", label: "Same day", pct: rush.same },
      ],
      defaultTurn: "standard",
      addons: { lamination: laminate, hot_foil: hotFoil, round_corners: roundCorners },
      marketing: null, relatedIds: [], tone: "professional", fileFee: 25, imageUrl: "", videos: [],
      template: result?.product ? { width_in: +(Number(result.product.finished_w) + 0.25).toFixed(2), height_in: +(Number(result.product.finished_h) + 0.25).toFixed(2) } : null,
    });
    api.get("/catalog-products").then((r) => setCatalogProducts((r.data || []).filter((p) => p.published))).catch(() => {});
    setConvOpen(true);
  };
  const toggleAllowed = (id) => setConvForm((f) => ({ ...f, allowedIds: f.allowedIds.includes(id) ? f.allowedIds.filter((x) => x !== id) : [...f.allowedIds, id] }));
  const toggleSide = (s) => setConvForm((f) => ({ ...f, sides: f.sides.includes(s) ? f.sides.filter((x) => x !== s) : [...f.sides, s] }));
  const setTurn = (id, patch) => setConvForm((f) => ({ ...f, turnarounds: f.turnarounds.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const addTurn = () => setConvForm((f) => ({ ...f, turnarounds: [...f.turnarounds, { id: `t${Date.now()}`, label: "", pct: 0 }] }));
  const removeTurn = (id) => setConvForm((f) => { const list = f.turnarounds.filter((t) => t.id !== id); return { ...f, turnarounds: list, defaultTurn: f.defaultTurn === id ? (list[0]?.id || "") : f.defaultTurn }; });
  const generateAI = async () => {
    const f = convForm;
    setGenLoading(true);
    try {
      const { data } = await api.post("/marketing/generate", {
        name: f.name, category: f.category, paper_class: f.paperClass,
        size: result?.product ? `${num(result.product.finished_w)}" x ${num(result.product.finished_h)}"` : "",
        sides: f.sides, addons: f.addons, turnarounds: f.turnarounds, sample_price: null, tone: f.tone,
      });
      setConvForm((p) => ({ ...p, marketing: data, description: data.short_description?.en || data.long_description?.en || p.description }));
      toast.success("AI marketing generated");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setGenLoading(false); }
  };

  const uploadProductImage = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setConvForm((f) => ({ ...f, imageUrl: data.url }));
      toast.success("Image uploaded");
    } catch (err) { toast.error(apiErr(err.response?.data?.detail) || err.message); }
  };

  const saveProduct = async () => {
    const f = convForm;
    if (!f.name.trim()) return toast.error("Name required");
    if (!f.autoByClass && f.allowedIds.length === 0) return toast.error("Select at least one paper");
    if (f.sides.length === 0) return toast.error("Allow at least one print side");
    if (!f.turnarounds || f.turnarounds.length === 0) return toast.error("Add at least one turnaround option");
    try {
      const res = await api.post("/catalog-products", {
        name: f.name, category: f.category, description: f.description, published: f.published,
        module: "paper", product_type: "configurable_paper", price: 0, wholesale_price: 0,
        marketing: f.marketing || {}, image_url: f.imageUrl || "",
        config: {
          base_product_id: productId, base_product_name: result.product?.name || "",
          sheet: canonSheet(sheet), auto_by_class: f.autoByClass, paper_class: f.paperClass,
          allowed_paper_ids: f.autoByClass ? [] : f.allowedIds,
          quantities: STD_TIERS, sides: f.sides, default_sides: f.defaultSides, addons: f.addons,
          turnarounds: f.turnarounds.map((t) => ({ id: t.id, label: (t.label || "").trim() || "Option", pct: Number(t.pct) || 0 })),
          default_turnaround: f.defaultTurn || (f.turnarounds[0]?.id || ""),
          related_ids: f.relatedIds || [],
          file_handling: { fee: Number(f.fileFee) || 0 },
          template: f.template || null,
          default_paper_id: selectedStock?.stock?.id || "",
          laminate_id: laminateId || "", laminate_sides: laminateSides, foil_id: foilId || "", foil_sides: foilSides,
        },
      });
      const newPid = res.data.id;
      for (const v of (f.videos || [])) {
        if (!v.url || !v.url.trim()) continue;
        try { await api.post("/training/videos", { url: v.url.trim(), title_es: v.title_es, title_en: v.title_en || v.title_es, category: "product", ref_id: newPid, ref_label: f.name, customer_visible: !!v.customer_visible }); } catch (e) {}
      }
      toast.success("Product created — clients can now order it");
      setConvOpen(false);
      api.get(`/products/paper-match?product_id=${productId}`).then((r) => setMatches(r.data || [])).catch(() => {});
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };

  const qtys = result?.qtys || [];
  const rowFor = (r, qty) => r?.quote.rows.find((x) => x.qty === qty);
  const retailOf = (row) => row?.[`customer_price_${side}`];
  const wholesaleOf = (row) => row?.[`wholesale_price_${side}`];
  const bestVal = (r) => { const dq = r.native || r.quote; const row = dq.rows.find((x) => x.qty === focusQty); return retailOf(row) ?? wholesaleOf(row) ?? Infinity; };

  const focusRow = useMemo(() => selectedStock && rowFor(selectedStock, focusQty), [selectedStock, focusQty]);
  const bestId = useMemo(() => {
    if (!result?.results?.length) return null;
    return result.results.reduce((b, r) => (bestVal(r) < bestVal(b) ? r : b), result.results[0]).stock.id;
    // eslint-disable-next-line
  }, [result, focusQty, side]);

  return (
    <div data-testid="paper-page">
      <PageHeader title="Paper Printing" subtitle="Imposition, cost comparison & instant pricing" testid="paper-header" eyebrow="Live Pricing" />
      <div className="p-8">
        {isAdmin && matches.length > 0 && (
          <div data-testid="paper-dup-alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="text-sm text-amber-800">
              Ya existe {matches.length > 1 ? `${matches.length} productos` : `el producto "${matches[0].name}"`} con estas especificaciones. Úsalo en la tienda en vez de recotizar.
            </div>
            <Button size="sm" variant="outline" className="rounded-lg border-amber-400 text-amber-800 shrink-0" onClick={() => nav("/products-catalog")} data-testid="paper-dup-view">Ver producto</Button>
          </div>
        )}
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="stocks" data-testid="tab-stocks" className="rounded-full">Paper Stocks</TabsTrigger>}
            {isAdmin && <TabsTrigger value="products" data-testid="tab-products" className="rounded-full">Paper Products</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            {/* Config */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 h-fit">
              <h3 className="font-head font-bold mb-4">Quote Setup</h3>
              <Label className="text-xs">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger data-testid="product-select" className="rounded-lg mt-1 mb-4"><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Label className="text-xs">Sheet Size</Label>
              <Select value={isCustom ? "custom" : canonSheet(sheet)} onValueChange={setSheet}>
                <SelectTrigger data-testid="sheet-select" className="rounded-lg mt-1 mb-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sheetOpts.filter((s) => s !== "custom").map((s) => <SelectItem key={s} value={s}>{fmtSheet(s)}</SelectItem>)}
                  <SelectItem value="custom" data-testid="sheet-custom-option">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {isCustom && (
                <div className="grid grid-cols-2 gap-2 mb-4" data-testid="custom-size-inputs">
                  <div><Label className="text-[11px] text-slate-500">W (in)</Label>
                    <Input data-testid="custom-w" type="number" step="0.01" value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="5.55" className="rounded-lg mt-1" /></div>
                  <div><Label className="text-[11px] text-slate-500">H (in)</Label>
                    <Input data-testid="custom-h" type="number" step="0.01" value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="8.90" className="rounded-lg mt-1" /></div>
                  <div className="col-span-2 text-[11px] text-slate-400">+0.25" bleed auto · imposed on 12"x18"</div>
                </div>
              )}
              {!isCustom && <div className="mb-4" />}

              <Label className="text-xs">Print Side</Label>
              <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
                {[["4_0", "4/0 (One side)"], ["4_4", "4/4 (Both sides)"]].map(([v, l]) => (
                  <button key={v} data-testid={`side-${v}`} onClick={() => setSide(v)}
                    className={`rounded-lg border py-2 text-sm font-semibold transition-colors ${side === v ? "bg-[#2495D3] border-[#2495D3] text-white" : "border-slate-200 text-slate-600 hover:border-[#2495D3]"}`}>{l}</button>
                ))}
              </div>

              <Label className="text-xs">Focus Quantity</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-4">
                {(qtys.length ? qtys : [25, 50, 100, 250, 500, 1000, 2500, 5000]).map((q) => (
                  <button key={q} data-testid={`focus-qty-${q}`} onClick={() => setFocusQty(q)}
                    className={`num text-xs rounded-full px-3 py-1 border transition-colors ${focusQty === q ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>{q}</button>
                ))}
              </div>

              <div className="py-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Lamination</Label>
                  <Switch data-testid="laminate-switch" checked={laminate} onCheckedChange={setLaminate} />
                </div>
                {laminate && (
                  <div className="mt-2 space-y-2" data-testid="laminate-picker">
                    <Select value={laminateId} onValueChange={setLaminateId}>
                      <SelectTrigger data-testid="laminate-select" className="rounded-lg h-9"><SelectValue placeholder="Choose laminate" /></SelectTrigger>
                      <SelectContent>{lamOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <button type="button" data-testid="lam-sides-1" onClick={() => setLaminateSides(1)} className={`flex-1 text-xs rounded-lg border py-1.5 ${laminateSides === 1 ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}>1 side</button>
                      <button type="button" data-testid="lam-sides-2" onClick={() => setLaminateSides(2)} className={`flex-1 text-xs rounded-lg border py-1.5 ${laminateSides === 2 ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}>2 sides</button>
                    </div>
                    {lamOptions.length === 0 && <p className="text-[11px] text-slate-400">No laminates registered. Add one in Materials (Paper → Type: Laminate).</p>}
                  </div>
                )}
              </div>
              <div className="py-2 mb-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Hot Foil</Label>
                  <Switch data-testid="hotfoil-switch" checked={hotFoil} onCheckedChange={setHotFoil} />
                </div>
                {hotFoil && (
                  <div className="mt-2 space-y-2" data-testid="foil-picker">
                    <Select value={foilId} onValueChange={setFoilId}>
                      <SelectTrigger data-testid="foil-select" className="rounded-lg h-9"><SelectValue placeholder="Choose foil" /></SelectTrigger>
                      <SelectContent>{foilOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}{o.foil_color ? ` · ${o.foil_color}` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <button type="button" data-testid="foil-sides-1" onClick={() => setFoilSides(1)} className={`flex-1 text-xs rounded-lg border py-1.5 ${foilSides === 1 ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}>1 side</button>
                      <button type="button" data-testid="foil-sides-2" onClick={() => setFoilSides(2)} className={`flex-1 text-xs rounded-lg border py-1.5 ${foilSides === 2 ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}>2 sides</button>
                    </div>
                    {foilOptions.length === 0 && <p className="text-[11px] text-slate-400 mt-1">No foils registered. Add one in Materials (Paper → Type: Hot Foil).</p>}
                  </div>
                )}
              </div>
              <div className="py-2 mb-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Round Corners</Label>
                  <Switch data-testid="roundcorners-switch" checked={roundCorners} onCheckedChange={setRoundCorners} />
                </div>
                {roundCorners && <p className="text-[11px] text-slate-400 mt-1">Charged per stack (configure pieces/stack & price in Settings → Round Corners).</p>}
              </div>
              <Button data-testid="calc-paper-button" onClick={calc} disabled={loading} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />{loading ? "Calculating…" : "Generate Quote"}
              </Button>
            </div>

            {/* Results */}
            <div className="lg:col-span-8">
              {!result || !selectedStock ? (
                <div className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400">Configure a job and generate an instant quote across every paper stock.</div>
              ) : (
                <div className="space-y-6" data-testid="paper-results">
                  {/* metric cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric icon={Layers} label="Pieces / Sheet" value={`${selectedStock.quote.n_up}${selectedStock.quote.rotated ? " ↻" : ""}`} />
                    <Metric icon={FileStack} label="Sheets Needed" value={focusRow?.sheets ?? "—"} />
                    {retailOf(focusRow) != null && <Metric icon={Tag} label={`Retail · ${focusQty}`} value={money(retailOf(focusRow))} accent />}
                    {retailOf(focusRow) != null
                      ? <Metric icon={DollarSign} label="Retail / Unit" value={money(focusRow[`retail_unit_${side}`])} />
                      : <Metric icon={Tag} label={`Wholesale · ${focusQty}`} value={money(wholesaleOf(focusRow))} accent />}
                  </div>

                  {/* nesting + selected paper */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Sheet Layout · {fmtSheet(selectedStock.quote.sheet)}</div>
                      <NestingCanvas layout={selectedStock.quote.layout} />
                      <div className="text-xs text-slate-500 num mt-1">{selectedStock.quote.piece_w}×{selectedStock.quote.piece_h}" per piece{selectedStock.quote.rotated ? " (rotated)" : ""}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
                      <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Selected Paper</div>
                      <div className="font-head font-bold text-lg mt-1">{selectedStock.stock.name}</div>
                      <div className="mt-auto pt-4">
                        <PricingPanel r={{
                          base_cost: focusRow?.[`base_cost_${side}`],
                          retail_total: focusRow?.[`customer_price_${side}`],
                          wholesale_total: focusRow?.[`wholesale_price_${side}`],
                          unit_price: focusRow?.[`retail_unit_${side}`],
                          wholesale_unit: focusRow?.[`wholesale_unit_${side}`],
                          qty: focusRow?.qty,
                          lamination_cost: focusRow?.lamination_cost,
                          foil_cost: focusRow?.foil_cost,
                          lamination_retail: focusRow?.lamination_retail,
                          foil_retail: focusRow?.foil_retail,
                          lamination_wholesale: focusRow?.lamination_wholesale,
                          foil_wholesale: focusRow?.foil_wholesale,
                          round_corner_retail: focusRow?.round_corner_retail,
                          round_corner_wholesale: focusRow?.round_corner_wholesale,
                        }} />
                        {focusRow?.volume_discount_pct > 0 && (
                          <div className="mt-2 text-[11px] font-mono uppercase tracking-widest text-emerald-600" data-testid="paper-volume-discount">Volume discount · {focusRow.volume_discount_pct}% off @ {focusQty} pc</div>
                        )}
                      </div>
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <SaveQuoteBar module="Paper" title={`${result.product?.name} · ${selectedStock.stock.name} · ${focusQty} ${side.replace("_", "/")}`} inputs={{ productId, sheet, laminate, laminate_id: laminateId, laminate_sides: laminateSides, hot_foil: hotFoil, foil_id: foilId, foil_sides: foilSides, side, focusQty }} summary={{ product: result.product, stock: selectedStock.stock, sheet: result.sheet_key, side, focus_qty: focusQty, row: focusRow }} />
                        {isAdmin && <Button data-testid="convert-to-product-button" onClick={openConvert} variant="outline" size="sm" className="rounded-sm"><Package size={15} className="mr-1.5" />Convert to product</Button>}
                      </div>
                    </div>
                  </div>

                  {/* comparison across papers, grouped by paper class */}
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">Compare Papers · {focusQty} pcs · {side.replace("_", "/")}</div>
                    {(() => {
                      const sorted = [...result.results].sort((a, b) => {
                        const ad = a.stock.is_default ? 0 : 1, bd = b.stock.is_default ? 0 : 1;
                        if (ad !== bd) return ad - bd;
                        return bestVal(a) - bestVal(b);
                      });
                      const card = (r, g) => {
                        const dq = r.native || r.quote;
                        const row = dq.rows.find((x) => x.qty === focusQty);
                        const isSel = selectedStock.stock.id === r.stock.id;
                        const isBest = bestId === r.stock.id;
                        return (
                          <button key={r.stock.id} data-testid="paper-compare-row" onClick={() => selectStock(r)}
                            className={`text-left rounded-xl border border-slate-200 border-l-4 ${g.accentL} p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "hover:border-slate-300"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-head font-bold text-sm">{r.stock.name}</div>
                              <div className="flex items-center gap-1">
                                {r.stock.is_default && <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" data-testid="paper-compare-default-badge">Default</span>}
                                {isBest && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best Value</span>}
                              </div>
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{dq.n_up}-up · {row?.sheets} sheets{r.native ? ` · ${fmtSheet(dq.sheet)}` : ""}</div>
                            {(() => {
                              const isRetail = retailOf(row) != null;
                              const base = isRetail ? retailOf(row) : wholesaleOf(row);
                              const taxed = base * (isRetail ? retailTaxF : wsTaxF);
                              return (
                                <div className="mt-2">
                                  <div className="num text-xl font-black text-[#2495D3]">{money(taxed)}</div>
                                  <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400 -mt-0.5">incl. tax</div>
                                </div>
                              );
                            })()}
                            <div className="text-[11px] text-slate-500 num mt-1">
                              {retailOf(row) != null && `${money(row[`retail_unit_${side}`])}/unit`}
                              {wholesaleOf(row) != null && retailOf(row) != null && ` · WS ${money(wholesaleOf(row) * wsTaxF)}`}
                              {wholesaleOf(row) != null && retailOf(row) == null && `${money(row[`wholesale_unit_${side}`])}/unit`}
                            </div>
                          </button>
                        );
                      };
                      return PAPER_GROUPS.map((g) => {
                        const items = sorted.filter((r) => paperClass(r.stock.name) === g.key);
                        if (items.length === 0) return null;
                        return (
                          <div key={g.key} className="mb-4" data-testid={`paper-group-${g.key}`}>
                            <div className={`flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest ${g.text} mb-2`}>
                              <span className={`inline-block w-2 h-2 rounded-full ${g.dot}`}></span>{g.label} · {items.length}
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {items.map((r) => card(r, g))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Volume pricing table — see savings as quantity grows */}
                  <div data-testid="paper-volume-table">
                    <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">Volume Pricing · {selectedStock.stock.name} · {side.replace("_", "/")}</div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                            <th className="text-left px-4 py-2">Qty</th>
                            <th className="text-right px-4 py-2">Discount</th>
                            {retailOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">Retail / unit</th>}
                            {retailOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">Retail total</th>}
                            {retailOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">Retail +tax</th>}
                            {wholesaleOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">WS / unit</th>}
                            {wholesaleOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">WS total</th>}
                            {wholesaleOf(rowFor(selectedStock, focusQty)) != null && <th className="text-right px-4 py-2">WS +tax</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStock.quote.rows.map((row) => (
                            <tr key={row.qty} data-testid="paper-volume-row"
                              onClick={() => setFocusQty(row.qty)}
                              className={`border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 ${row.qty === focusQty ? "bg-[#2495D3]/5" : ""}`}>
                              <td className="px-4 py-2 num font-semibold">{row.qty}</td>
                              <td className="px-4 py-2 text-right num">{(row.volume_discount_pct || 0) > 0 ? <span className="text-emerald-600">−{row.volume_discount_pct}%</span> : <span className="text-slate-300">—</span>}</td>
                              {retailOf(row) != null && <td className="px-4 py-2 text-right num text-slate-600">{money(row[`retail_unit_${side}`])}</td>}
                              {retailOf(row) != null && <td className="px-4 py-2 text-right num font-semibold text-[#2495D3]">{money(retailOf(row))}</td>}
                              {retailOf(row) != null && <td className="px-4 py-2 text-right num text-[#2495D3]" data-testid="paper-volume-retail-tax">{money(retailOf(row) * retailTaxF)}</td>}
                              {wholesaleOf(row) != null && <td className="px-4 py-2 text-right num text-slate-500">{money(row[`wholesale_unit_${side}`])}</td>}
                              {wholesaleOf(row) != null && <td className="px-4 py-2 text-right num text-slate-600">{money(wholesaleOf(row))}</td>}
                              {wholesaleOf(row) != null && <td className="px-4 py-2 text-right num text-slate-600" data-testid="paper-volume-ws-tax">{money(wholesaleOf(row) * wsTaxF)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">Tap a row to set it as your focus quantity. +tax: Retail incl. GST {rush.gst}% + PST {rush.pst}%; WS incl. GST {rush.gst}% only. Discounts editable in Settings → Volume Discounts.</p>
                  </div>

                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="stocks" className="mt-6">
            {isAdmin && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500">Reference view · paper stocks read from the central Materials DB (prices honor any overrides).</p>
                  <a href="/materials" className="text-xs text-[#2495D3] hover:underline" data-testid="manage-materials-link">Manage in Materials →</a>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                        <th className="text-left px-4 py-2.5">Paper</th>
                        <th className="text-right px-4 py-2.5">Unit cost</th>
                        <th className="text-right px-4 py-2.5">Finish cost</th>
                        <th className="text-right px-4 py-2.5">Printed 1 side</th>
                        <th className="text-right px-4 py-2.5">Printed 2 sides</th>
                        <th className="text-right px-4 py-2.5">Retail</th>
                        <th className="text-right px-4 py-2.5">Wholesale</th>
                        <th className="text-center px-4 py-2.5">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...paperMats].sort((a, b) => (PAPER_GROUPS.findIndex((g) => g.key === paperClass(a.name))) - (PAPER_GROUPS.findIndex((g) => g.key === paperClass(b.name)))).map((m, idx, arr) => {
                        const g = PAPER_GROUPS.find((x) => x.key === paperClass(m.name));
                        const showHeader = idx === 0 || paperClass(arr[idx - 1].name) !== g.key;
                        return (
                        <Fragment key={m.id}>
                        {showHeader && (
                          <tr data-testid={`stock-group-${g.key}`}><td colSpan={8} className={`px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest ${g.text} bg-slate-50/70`}><span className={`inline-block w-2 h-2 rounded-full ${g.dot} mr-2 align-middle`}></span>{g.label}</td></tr>
                        )}
                        <tr data-testid="paper-stock-row" className={`border-b border-slate-100 hover:bg-slate-50 border-l-4 ${g.accentL}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium flex items-center gap-2">
                              {m.name}
                              {(m.default_modules || []).includes("paper") && <span className="bg-amber-100 text-amber-700 text-[10px] rounded px-1.5 py-0.5" data-testid="paper-stock-default-badge">DEFAULT</span>}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">{m.size || "—"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right num">{money(m.unit_cost)}</td>
                          <td className="px-4 py-2.5 text-right num font-semibold">{money(m.finish_cost)}</td>
                          <td className="px-4 py-2.5 text-right num text-slate-600" data-testid="paper-stock-printed-1">{money((m.finish_cost || 0) + (m.click_cost ?? 0.055))}</td>
                          <td className="px-4 py-2.5 text-right num text-slate-600" data-testid="paper-stock-printed-2">{money((m.finish_cost || 0) + 2 * (m.click_cost ?? 0.055))}</td>
                          <td className="px-4 py-2.5 text-right num text-[#2495D3]">{money(m.selling_price)}</td>
                          <td className="px-4 py-2.5 text-right num text-slate-600">{money(m.wholesale_price)}</td>
                          <td className="px-4 py-2.5 text-center num">{m.stock_qty}</td>
                        </tr>
                        </Fragment>
                        );
                      })}
                      {paperMats.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No paper materials assigned to this module. Add one in Materials.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="products" className="mt-6">
            {isAdmin && <CrudManager endpoint="products" fields={prodFields} columns={prodCols} prefix="product" onChange={setProducts} sortFn={(a, b) => (Number(a.finished_w) * Number(a.finished_h)) - (Number(b.finished_w) * Number(b.finished_h)) || Number(a.finished_w) - Number(b.finished_w)} />}
          </TabsContent>
        </Tabs>

        {convForm && (
          <Dialog open={convOpen} onOpenChange={setConvOpen}>
            <DialogContent className="rounded-xl max-w-lg max-h-[85vh] overflow-y-auto" data-testid="convert-product-dialog">
              <DialogHeader>
                <DialogTitle className="font-head">Convert to product</DialogTitle>
                <DialogDescription className="text-xs text-slate-400">Creates a configurable product your clients can order (they pick quantity, paper & add-ons).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Product name</Label><Input data-testid="conv-name" value={convForm.name} onChange={(e) => setConvForm((f) => ({ ...f, name: e.target.value }))} className="rounded-lg mt-1" /></div>
                  <div><Label className="text-xs">Category</Label><Input data-testid="conv-category" value={convForm.category} onChange={(e) => setConvForm((f) => ({ ...f, category: e.target.value }))} className="rounded-lg mt-1" /></div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Description &amp; marketing</Label>
                    <div className="flex items-center gap-2">
                      <select value={convForm.tone} onChange={(e) => setConvForm((f) => ({ ...f, tone: e.target.value }))} className="text-[11px] border border-slate-300 rounded px-1 py-0.5" data-testid="conv-tone">
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="playful">Playful</option>
                        <option value="luxury">Luxury</option>
                        <option value="bold">Bold</option>
                      </select>
                      <button type="button" onClick={generateAI} disabled={genLoading} className="text-[11px] text-[#2495D3] hover:underline inline-flex items-center gap-1 disabled:opacity-50" data-testid="conv-generate-ai">
                        <Sparkles size={13} /> {genLoading ? "Generating…" : "Generate with AI"}
                      </button>
                    </div>
                  </div>
                  <Input data-testid="conv-desc" value={convForm.description} onChange={(e) => setConvForm((f) => ({ ...f, description: e.target.value }))} className="rounded-lg mt-1" placeholder="Short store description (or generate with AI)" />
                  {convForm.marketing && (
                    <div className="mt-2 space-y-1.5" data-testid="conv-ai-preview">
                      {(() => {
                        const m = convForm.marketing;
                        const gt = (v) => (v && typeof v === "object" ? `EN: ${v.en || ""}\n\nES: ${v.es || ""}` : (v || ""));
                        const fields = [["SEO title", gt(m.seo_title)], ["SEO description", gt(m.seo_description)], ["Slug", m.slug], ["Hashtags", (m.hashtags || []).join(" ")], ["Short description", gt(m.short_description)], ["Long description", gt(m.long_description)], ["Instagram", gt(m.instagram)], ["Facebook", gt(m.facebook)], ["Kijiji", m.kijiji ? `EN: ${m.kijiji.en?.title || ""}\n${m.kijiji.en?.body || ""}\n\nES: ${m.kijiji.es?.title || ""}\n${m.kijiji.es?.body || ""}` : ""], ["Image alt", gt(m.image_alt)]];
                        return fields.map(([label, val]) => (
                          <div key={label} className="rounded-lg border border-slate-200 p-2" data-testid="conv-mk-field">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{label}</span>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(val || ""); toast.success("Copied"); }} className="text-slate-400 hover:text-[#2495D3]"><Copy size={13} /></button>
                            </div>
                            <div className="text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-4">{val || <span className="text-slate-300">— empty —</span>}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Related products ("You may also like")</Label>
                  <div className="flex flex-wrap gap-2 mt-1" data-testid="conv-related">
                    {catalogProducts.length === 0 && <span className="text-[11px] text-slate-400">No other products yet.</span>}
                    {catalogProducts.map((p) => (
                      <button key={p.id} type="button" onClick={() => setConvForm((f) => ({ ...f, relatedIds: f.relatedIds.includes(p.id) ? f.relatedIds.filter((x) => x !== p.id) : [...f.relatedIds, p.id] }))}
                        className={`text-xs rounded-full px-3 py-1 border ${convForm.relatedIds.includes(p.id) ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-600 border-slate-300"}`}>{p.name}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Product image</Label>
                    <input type="file" accept="image/*" onChange={uploadProductImage} className="text-[11px] mt-1 block w-full" data-testid="conv-image-upload" />
                    {convForm.imageUrl && <img src={`${API}${convForm.imageUrl}?auth=${localStorage.getItem("pns_token")}`} alt="preview" className="mt-1 h-14 rounded object-cover" />}
                    <ProductImageAI name={convForm.name} description={convForm.description || convForm.marketing?.short_description?.en} value={convForm.imageUrl} onGenerated={(url) => setConvForm((f) => ({ ...f, imageUrl: url }))} />
                  </div>
                  <div>
                    <Label className="text-xs">File setup fee ($)</Label>
                    <Input type="number" value={convForm.fileFee} onChange={(e) => setConvForm((f) => ({ ...f, fileFee: e.target.value }))} className="rounded-lg mt-1 h-9 num" data-testid="conv-file-fee" />
                    <p className="text-[10px] text-slate-400 mt-1">Charged if the client's file isn't print-ready (editable per product).</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Papers offered — auto by class ({convForm.paperClass})</Label>
                    <Switch data-testid="conv-auto-class" checked={convForm.autoByClass} onCheckedChange={(v) => setConvForm((f) => ({ ...f, autoByClass: v }))} />
                  </div>
                  {convForm.autoByClass ? (
                    <p className="text-[11px] text-slate-500 mt-2">All <b>{convForm.paperClass}</b> papers are offered automatically (new ones you add later appear too).</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2" data-testid="conv-paper-chips">
                      {paperMats.map((m) => (
                        <button key={m.id} type="button" onClick={() => toggleAllowed(m.id)}
                          className={`text-xs rounded-full px-3 py-1 border transition-colors ${convForm.allowedIds.includes(m.id) ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-600 border-slate-300"}`}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Print sides offered</Label>
                  <div className="flex gap-2 mt-1">
                    {[["4_0", "One side"], ["4_4", "Both sides"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => toggleSide(v)} data-testid={`conv-side-${v}`}
                        className={`text-xs rounded-full px-3 py-1 border ${convForm.sides.includes(v) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}>{l}</button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <Label className="text-xs font-semibold">Add-ons the client can choose</Label>
                  {[["lamination", "Lamination"], ["hot_foil", "Hot Foil"], ["round_corners", "Round Corners"]].map(([k, l]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{l}</span>
                      <Switch data-testid={`conv-addon-${k}`} checked={!!convForm.addons[k]} onCheckedChange={(v) => setConvForm((f) => ({ ...f, addons: { ...f.addons, [k]: v } }))} />
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Turnaround / production times</Label>
                    <button type="button" onClick={addTurn} className="text-[11px] text-[#2495D3] hover:underline" data-testid="conv-add-turn">+ Add option</button>
                  </div>
                  {convForm.turnarounds.map((t) => (
                    <div key={t.id} className="flex items-center gap-2" data-testid="conv-turn-row">
                      <button type="button" onClick={() => setConvForm((f) => ({ ...f, defaultTurn: t.id }))} title="Set as default"
                        className={`text-[10px] rounded px-1.5 py-1 border shrink-0 ${convForm.defaultTurn === t.id ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-300"}`} data-testid={`conv-turn-default-${t.id}`}>Default</button>
                      <Input value={t.label} onChange={(e) => setTurn(t.id, { label: e.target.value })} placeholder="Name (e.g. 2 hour same day)" className="rounded-lg h-8 text-xs flex-1" data-testid={`conv-turn-name-${t.id}`} />
                      <div className="flex items-center gap-1 shrink-0">
                        <Input type="number" value={t.pct} onChange={(e) => setTurn(t.id, { pct: e.target.value })} className="rounded-lg h-8 text-xs w-16 num" data-testid={`conv-turn-pct-${t.id}`} />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <button type="button" onClick={() => removeTurn(t.id)} className="text-slate-300 hover:text-red-500 shrink-0" data-testid={`conv-turn-remove-${t.id}`}><X size={14} /></button>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400">Surcharge % applies to both Retail &amp; Wholesale. The Default is preselected in the store.</p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold">Training videos</Label>
                    <button type="button" onClick={() => setConvForm((f) => ({ ...f, videos: [...(f.videos || []), { url: "", title_es: "", title_en: "", customer_visible: false }] }))} className="text-[11px] text-[#2495D3] hover:underline" data-testid="conv-add-video">+ Add video</button>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">Paste a YouTube (unlisted) / Vimeo / Drive link and name it (e.g. "How to make this"). Employees see it in the Training Center.</p>
                  {(convForm.videos || []).map((v, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2" data-testid="conv-video-row">
                      <Input value={v.title_es} onChange={(e) => setConvForm((f) => ({ ...f, videos: f.videos.map((x, idx) => (idx === i ? { ...x, title_es: e.target.value } : x)) }))} placeholder="Nombre / Name" className="rounded-lg h-8 text-xs w-40" data-testid={`conv-video-title-${i}`} />
                      <Input value={v.url} onChange={(e) => setConvForm((f) => ({ ...f, videos: f.videos.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)) }))} placeholder="https://youtu.be/..." className="rounded-lg h-8 text-xs flex-1 num" data-testid={`conv-video-url-${i}`} />
                      <label className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title="Show on the product page in the store"><input type="checkbox" checked={!!v.customer_visible} onChange={(e) => setConvForm((f) => ({ ...f, videos: f.videos.map((x, idx) => (idx === i ? { ...x, customer_visible: e.target.checked } : x)) }))} data-testid={`conv-video-store-${i}`} /> Store</label>
                      <button type="button" onClick={() => setConvForm((f) => ({ ...f, videos: f.videos.filter((_, idx) => idx !== i) }))} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Publish now (visible in Store)</Label>
                  <Switch data-testid="conv-published" checked={convForm.published} onCheckedChange={(v) => setConvForm((f) => ({ ...f, published: v }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConvOpen(false)} className="rounded-lg">Cancel</Button>
                <Button data-testid="conv-save" onClick={saveProduct} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg">Create product</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
