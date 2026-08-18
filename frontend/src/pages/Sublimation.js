import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import CrudManager from "@/components/CrudManager";
import { CostRow } from "@/components/Totals";
import { Metric, EmptyState, SectionLabel, priceOf, PricingPanel } from "@/components/Metric";
import { SaveQuoteBar } from "@/components/SaveQuote";
import VolumePricingTable from "@/components/VolumePricingTable";
import { useRequote } from "@/lib/useRequote";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { Calculator, Coffee, Hash, Tag, DollarSign } from "lucide-react";

const prodFields = [
  { name: "name", label: "Product Name", type: "text", full: true },
  { name: "category", label: "Category", type: "select", options: ["mug", "frame", "keychain", "plate", "tumbler", "other"], default: "mug" },
  { name: "model", label: "Model", type: "text" },
  { name: "price_per_box", label: "Price / box (CAD)", type: "number" },
  { name: "pieces_per_box", label: "Pieces / box", type: "number", default: 36 },
  { name: "cost_per_unit", label: "Cost / unit (override)", type: "number" },
  { name: "uses_paper", label: "Uses sublimation paper", type: "switch" },
  { name: "print_bleed_w", label: "Print bleed W (in)", type: "number" },
  { name: "print_bleed_h", label: "Print bleed H (in)", type: "number" },
  { name: "is_default", label: "Default product (pre-selected in quotes)", type: "switch", full: true },
];
const prodCols = [
  { name: "name", label: "Product" },
  { name: "category", label: "Category" },
  { name: "model", label: "Model", mono: true },
  { name: "price_per_box", label: "Box", mono: true, render: (i) => money(i.price_per_box) },
  { name: "pieces_per_box", label: "Pcs/box", mono: true },
  { name: "print", label: "Print", mono: true, render: (i) => (i.uses_paper ? `${i.print_bleed_w}×${i.print_bleed_h}"` : "—") },
  { name: "is_default", label: "Default", render: (i) => (i.is_default ? <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Default</span> : "—") },
];

export default function Sublimation() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(25);
  const [res, setRes] = useState(null);

  const load = () => api.get("/sublimation-products").then((r) => { setProducts(r.data); if (!productId && r.data.length) setProductId((r.data.find((p) => p.is_default) || r.data[0]).id); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const calc = async () => {
    if (!productId) return toast.error("Select a product");
    try {
      const { data } = await api.post("/calc/sublimation", { product_id: productId, quantity: +qty });
      setRes(data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail)); }
  };

  useRequote((rq) => {
    if (rq.productId) setProductId(rq.productId);
    if (rq.qty != null) setQty(rq.qty);
  }, calc);

  return (
    <div data-testid="sublimation-page">
      <PageHeader title="Sublimation" eyebrow="Live Pricing" subtitle="Mugs, frames, keychains… · auto paper consumption (SureColor F570)" />
      <div className="p-8">
        <Tabs defaultValue="calc">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="calc" data-testid="tab-calc" className="rounded-full">Calculator</TabsTrigger>
            {isAdmin && <TabsTrigger value="products" data-testid="tab-sub-products" className="rounded-full">Products</TabsTrigger>}
          </TabsList>

          <TabsContent value="calc" className="mt-6 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 h-fit">
              <h3 className="font-head font-bold mb-4">Job</h3>
              <Label className="text-xs">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger data-testid="sub-product-select" className="rounded-lg mt-1 mb-4"><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Label className="text-xs">Quantity</Label>
              <Input data-testid="sub-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-lg mt-1 mb-4 num" />
              <Button data-testid="calc-sub-button" onClick={calc} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg h-11">
                <Calculator size={16} className="mr-2" />Calculate
              </Button>
            </div>
            <div className="lg:col-span-7">
              {!res ? (
                <EmptyState>Select a product and calculate.</EmptyState>
              ) : (
                <div className="space-y-6" data-testid="sub-results">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric icon={Coffee} label="Product" value={res.quantity} sub={res.product.name} />
                    <Metric icon={Hash} label="Paper Used" value={res.paper_used_in > 0 ? `${res.paper_used_in}"` : "—"} />
                    {priceOf(res) != null && <Metric icon={Tag} label={res.retail_total != null ? "Retail" : "Wholesale"} value={money(priceOf(res))} accent />}
                    {(res.unit_price ?? res.wholesale_unit) != null && <Metric icon={DollarSign} label="Per Unit" value={money(res.unit_price ?? res.wholesale_unit)} />}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <SectionLabel>{res.product.name} · Cost Breakdown</SectionLabel>
                    <CostRow label="Blank cost" value={res.blank_cost} />
                    <CostRow label="Sublimation paper" value={res.material_cost} />
                    <CostRow label="Ink" value={res.ink_cost} />
                    <CostRow label="Labor" value={res.labor} />
                    <PricingPanel r={res} className="mt-3" />
                    <VolumePricingTable className="mt-4" endpoint="/calc/sublimation"
                      makeBody={(q) => ({ product_id: productId, quantity: q })}
                      extract={(d) => d} signature={`${productId}`} unitLabel="unit" />
                    <div className="mt-3 flex justify-end"><SaveQuoteBar module="Sublimation" title={`${res.product.name} x${res.quantity}`} inputs={{ productId, qty }} summary={res} /></div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="products" className="mt-6">
              <CrudManager endpoint="sublimation-products" fields={prodFields} columns={prodCols} prefix="sub-product" onChange={setProducts} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
