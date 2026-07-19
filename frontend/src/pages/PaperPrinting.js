import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

const SHEETS = ["8.5x11", "8.5x14", "11x17", "12x18", "13x19"];

const stockFields = [
  { name: "name", label: "Name", type: "text", full: true },
  { name: "size", label: "Size", type: "text", default: "13x19" },
  { name: "sheets_per_box", label: "Sheets / Box", type: "number", default: 500 },
  { name: "cost_per_box", label: "Cost / Box (CAD)", type: "number" },
];
const stockCols = [
  { name: "name", label: "Name" },
  { name: "size", label: "Size", mono: true },
  { name: "sheets_per_box", label: "Sheets/Box", mono: true },
  { name: "cost_per_box", label: "Cost/Box", mono: true, render: (i) => money(i.cost_per_box) },
  { name: "cost_per_sheet", label: "Cost/Sheet", mono: true, render: (i) => money(i.cost_per_sheet) },
];
const prodFields = [
  { name: "name", label: "Product Name", type: "text", full: true },
  { name: "finished_w", label: "Finished W (in)", type: "number", default: 3.5 },
  { name: "finished_h", label: "Finished H (in)", type: "number", default: 2 },
  { name: "bleed_w", label: "Bleed W (in)", type: "number", default: 3.75 },
  { name: "bleed_h", label: "Bleed H (in)", type: "number", default: 2.25 },
];
const prodCols = [
  { name: "name", label: "Product" },
  { name: "finished", label: "Finished", mono: true, render: (i) => `${num(i.finished_w)} × ${num(i.finished_h)}"` },
  { name: "bleed", label: "With Bleed", mono: true, render: (i) => `${num(i.bleed_w || i.finished_w)} × ${num(i.bleed_h || i.finished_h)}"` },
];

export default function PaperPrinting() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [sheet, setSheet] = useState("13x19");
  const [laminate, setLaminate] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadProducts = () => api.get("/products").then((r) => {
    setProducts(r.data);
    if (!productId && r.data[0]) setProductId(r.data[0].id);
  });
  useEffect(() => { loadProducts(); /* eslint-disable-next-line */ }, []);

  const calc = async () => {
    if (!productId) return toast.error("Select a product");
    setLoading(true);
    try {
      const { data } = await api.post("/calc/paper", { product_id: productId, sheet_key: sheet, laminate });
      setResult(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  return (
    <div data-testid="paper-page">
      <PageHeader title="Paper Printing" subtitle="Stocks · Products · Imposition & pricing" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-sm">
            <TabsTrigger value="calc" data-testid="tab-calc">Calculator</TabsTrigger>
            <TabsTrigger value="stocks" data-testid="tab-stocks">Paper Stocks</TabsTrigger>
            <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
          </TabsList>

          <TabsContent value="calc" className="mt-6">
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-sm p-6 h-fit">
                <h3 className="font-head font-bold mb-4">Job Setup</h3>
                <Label className="text-xs">Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger data-testid="product-select" className="rounded-sm mt-1 mb-4"><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label className="text-xs">Sheet Size</Label>
                <Select value={sheet} onValueChange={setSheet}>
                  <SelectTrigger data-testid="sheet-select" className="rounded-sm mt-1 mb-4"><SelectValue /></SelectTrigger>
                  <SelectContent>{SHEETS.map((s) => <SelectItem key={s} value={s}>{s}"</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center justify-between py-2 mb-4">
                  <Label className="text-xs">Lamination</Label>
                  <Switch data-testid="laminate-switch" checked={laminate} onCheckedChange={setLaminate} />
                </div>
                <Button data-testid="calc-paper-button" onClick={calc} disabled={loading} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
                  <Calculator size={16} className="mr-2" />{loading ? "Calculating…" : "Compare Stocks"}
                </Button>
              </div>

              <div className="lg:col-span-8">
                {!result ? (
                  <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-400">
                    Configure a job and compare pricing across all paper stocks.
                  </div>
                ) : (
                  <div className="space-y-6" data-testid="paper-results">
                    {result.results.map((r, idx) => (
                      <div key={r.stock.id} className="bg-white border border-slate-200 rounded-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                          <div className="font-head font-bold">
                            {r.stock.name}
                            {idx === 0 && <span className="ml-2 text-[10px] font-mono uppercase bg-[#2495D3] text-white px-2 py-0.5 rounded-sm">Best Price</span>}
                          </div>
                          <div className="text-xs font-mono text-slate-500">{r.quote.n_up}-up · {r.quote.sheet}" · {money(r.quote.cost_per_sheet)}/sheet</div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm num tabular">
                            <thead>
                              <tr className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <th className="text-right px-3 py-2">Qty</th>
                                <th className="text-right px-3 py-2">Sheets</th>
                                <th className="text-right px-3 py-2">Material</th>
                                <th className="text-right px-3 py-2">4/0</th>
                                <th className="text-right px-3 py-2">4/4</th>
                                <th className="text-right px-3 py-2 text-[#2495D3]">Cust 4/4</th>
                                <th className="text-right px-3 py-2">Wholesale</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.quote.rows.map((row) => (
                                <tr key={row.qty} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="text-right px-3 py-2 font-semibold">{row.qty}</td>
                                  <td className="text-right px-3 py-2 text-slate-500">{row.sheets}</td>
                                  <td className="text-right px-3 py-2">{money(row.material_cost)}</td>
                                  <td className="text-right px-3 py-2">{money(row.customer_price_4_0)}</td>
                                  <td className="text-right px-3 py-2">{money(row.customer_price_4_4)}</td>
                                  <td className="text-right px-3 py-2 text-[#2495D3] font-semibold">{money(row.customer_price_4_4)}</td>
                                  <td className="text-right px-3 py-2 text-slate-500">{money(row.wholesale_price_4_4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stocks" className="mt-6">
            <CrudManager endpoint="paper-stocks" fields={stockFields} columns={stockCols} prefix="stock" />
          </TabsContent>
          <TabsContent value="products" className="mt-6">
            <CrudManager endpoint="products" fields={prodFields} columns={prodCols} prefix="product" onChange={setProducts} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
