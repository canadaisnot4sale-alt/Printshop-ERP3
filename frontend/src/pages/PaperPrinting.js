import { useEffect, useMemo, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useDefaultSheetSize } from "@/lib/useDefaultSheetSize";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import NestingCanvas from "@/components/NestingCanvas";
import { SaveQuoteBar } from "@/components/SaveQuote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num } from "@/lib/format";
import { PricingPanel, useRushRates } from "@/components/Metric";
import { useRequote } from "@/lib/useRequote";
import { toast } from "sonner";
import { Calculator, Layers, FileStack, DollarSign, Tag } from "lucide-react";

const SHEETS = ["8.5x11", "8.5x14", "11x17", "12x18", "13x19"];

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
  { name: "finished", label: "Finished", mono: true, render: (i) => `${num(i.finished_w)} × ${num(i.finished_h)}"` },
  { name: "bleed", label: "With Bleed", mono: true, render: (i) => `${num(i.bleed_w || i.finished_w)} × ${num(i.bleed_h || i.finished_h)}"` },
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
  const loadProducts = () => api.get("/products").then((r) => {
    const list = [...r.data].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    setProducts(list);
    if (!productId && list.length) setProductId((list.find((p) => p.is_default) || list[0]).id);
  });
  const loadPaperMats = () => api.get("/materials").then((r) => setPaperMats((r.data || []).filter((m) => (m.modules || []).includes("paper") && (m.paper_type || "normal") === "normal"))).catch(() => {});
  useEffect(() => { loadProducts(); if (isAdmin) loadPaperMats(); /* eslint-disable-next-line */ }, []);
  // Default Sheet Size to the size of this module's DEFAULT paper material (unless re-quoting)
  useDefaultSheetSize("/paper-stocks?module=paper", setSheet);

  const sheetOpts = [...new Set([...SHEETS, ...(sheet ? [sheet] : [])])];

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

  const calc = async (sheetKey = sheet, keepStockId = null) => {
    if (typeof sheetKey !== "string") sheetKey = sheet;   // ignore event arg from onClick
    if (!productId) return toast.error("Select a product");
    setLoading(true);
    try {
      const { data } = await api.post("/calc/paper", { product_id: productId, sheet_key: sheetKey, laminate, laminate_id: laminate ? (laminateId || null) : null, laminate_sides: laminateSides, foil_id: hotFoil ? (foilId || null) : null, foil_sides: foilSides, round_corners: roundCorners });
      setResult(data);
      const rows = data.results || [];
      setSelectedStock((keepStockId && rows.find((r) => r.stock.id === keepStockId)) || rows.find((r) => r.stock.is_default) || rows[0] || null);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  // Selecting a paper switches the Sheet Size to that paper's size and recalculates its layout.
  const selectStock = (r) => {
    const raw = (r.stock.size || "").toString().trim().toLowerCase().replace(/["\s]/g, "").replace(/×/g, "x");
    const key = /^[\d.]+x[\d.]+$/.test(raw) ? raw : null;
    if (key && key !== sheet) {
      setSheet(key);
      calc(key, r.stock.id);
    } else {
      setSelectedStock(r);
    }
  };

  useRequote((rq) => {
    if (rq.productId) setProductId(rq.productId);
    if (rq.sheet) setSheet(rq.sheet);
    if (rq.laminate != null) setLaminate(rq.laminate);
    if (rq.laminate_id) setLaminateId(rq.laminate_id);
    if (rq.laminate_sides) setLaminateSides(rq.laminate_sides);
    if (rq.hot_foil != null) setHotFoil(rq.hot_foil);
    if (rq.foil_id) setFoilId(rq.foil_id);
    if (rq.foil_sides) setFoilSides(rq.foil_sides);
    if (rq.side) setSide(rq.side);
    if (rq.focusQty) setFocusQty(rq.focusQty);
  }, calc);

  const qtys = result?.qtys || [];
  const rowFor = (r, qty) => r?.quote.rows.find((x) => x.qty === qty);
  const retailOf = (row) => row?.[`customer_price_${side}`];
  const wholesaleOf = (row) => row?.[`wholesale_price_${side}`];
  const bestVal = (r) => { const row = rowFor(r, focusQty); return retailOf(row) ?? wholesaleOf(row) ?? Infinity; };

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
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="stocks" data-testid="tab-stocks" className="rounded-full">Paper Stocks</TabsTrigger>}
            {isAdmin && <TabsTrigger value="products" data-testid="tab-products" className="rounded-full">Products</TabsTrigger>}
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
              <Select value={sheet} onValueChange={setSheet}>
                <SelectTrigger data-testid="sheet-select" className="rounded-lg mt-1 mb-4"><SelectValue /></SelectTrigger>
                <SelectContent>{sheetOpts.map((s) => <SelectItem key={s} value={s}>{s}"</SelectItem>)}</SelectContent>
              </Select>

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
                      <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Sheet Layout · {selectedStock.quote.sheet}"</div>
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
                      <div className="mt-4"><SaveQuoteBar module="Paper" title={`${result.product?.name} · ${selectedStock.stock.name} · ${focusQty} ${side.replace("_", "/")}`} inputs={{ productId, sheet, laminate, laminate_id: laminateId, laminate_sides: laminateSides, hot_foil: hotFoil, foil_id: foilId, foil_sides: foilSides, side, focusQty }} summary={{ product: result.product, stock: selectedStock.stock, sheet: result.sheet_key, side, focus_qty: focusQty, row: focusRow }} /></div>
                    </div>
                  </div>

                  {/* comparison across papers */}
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">Compare Papers · {focusQty} pcs · {side.replace("_", "/")}</div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[...result.results].sort((a, b) => {
                        const ad = a.stock.is_default ? 0 : 1, bd = b.stock.is_default ? 0 : 1;
                        if (ad !== bd) return ad - bd;
                        return bestVal(a) - bestVal(b);
                      }).map((r) => {
                        const row = rowFor(r, focusQty);
                        const isSel = selectedStock.stock.id === r.stock.id;
                        const isBest = bestId === r.stock.id;
                        return (
                          <button key={r.stock.id} data-testid="paper-compare-row" onClick={() => selectStock(r)}
                            className={`text-left rounded-xl border p-4 transition-all ${isSel ? "border-[#2495D3] ring-1 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-head font-bold text-sm">{r.stock.name}</div>
                              <div className="flex items-center gap-1">
                                {r.stock.is_default && <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" data-testid="paper-compare-default-badge">Default</span>}
                                {isBest && <span className="text-[10px] font-mono uppercase bg-emerald-500 text-white px-2 py-0.5 rounded-full">Best Value</span>}
                              </div>
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">{r.quote.n_up}-up · {row?.sheets} sheets</div>
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
                      })}
                    </div>
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
                      {paperMats.map((m) => (
                        <tr key={m.id} data-testid="paper-stock-row" className="border-b border-slate-100 hover:bg-slate-50">
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
                      ))}
                      {paperMats.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No paper materials assigned to this module. Add one in Materials.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="products" className="mt-6">
            {isAdmin && <CrudManager endpoint="products" fields={prodFields} columns={prodCols} prefix="product" onChange={setProducts} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
