import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useStoreCart } from "@/context/StoreCartContext";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShoppingBag, Plus, Minus, Trash2, Store, CreditCard, Sliders } from "lucide-react";
import { API } from "@/lib/api";
const authImg = (u) => (u ? (u.startsWith("http") ? u : `${API}${u}?auth=${localStorage.getItem("pns_token")}`) : null);

export default function Storefront() {
  const { user } = useAuth();
  const nav = useNavigate();
  const cart = useStoreCart();
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => { api.get("/catalog-products").then(({ data }) => setProducts(data.filter((p) => p.published))); }, []);

  const priceOf = (p) => p.your_price ?? p.price ?? 0;
  const addStatic = (p) => cart.add({
    lineKey: p.id, product_id: p.id, name: p.name, unitPrice: priceOf(p), priceInclTax: priceOf(p), qty: 1,
  });

  const placeOrder = async (thenPay = false) => {
    setPlacing(true);
    try {
      const { data: order } = await api.post("/orders", {
        items: cart.items.map((i) => ({ product_id: i.product_id, qty: i.qty, config: i.config || null })),
        notes,
      });
      cart.clear(); setNotes(""); setOpen(false);
      if (thenPay) {
        const { data } = await api.post("/payments/checkout", { order_id: order.id, origin_url: window.location.origin });
        window.location.href = data.checkout_url;
        return;
      }
      toast.success("Order placed!");
      nav("/orders");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setPlacing(false); }
  };

  const groups = {};
  products.forEach((p) => (groups[p.category || "Other"] = groups[p.category || "Other"] || []).push(p));

  return (
    <div data-testid="storefront-page">
      <PageHeader title="Store" eyebrow="Shop" subtitle="Browse products and place an order.">
        <Button onClick={() => setOpen(true)} disabled={cart.count === 0} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="store-cart-button">
          <ShoppingBag size={16} className="mr-1.5" /> Cart ({cart.count}) · {money(cart.totalInclTax)}
        </Button>
      </PageHeader>

      <div className="p-8 space-y-8">
        {products.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center text-slate-400" data-testid="store-empty">
            <Store className="mx-auto mb-3 text-slate-300" size={40} />No products are published yet.
          </div>
        )}
        {Object.keys(groups).sort().map((cat) => (
          <div key={cat}>
            <h3 className="font-head font-bold text-lg mb-3">{cat}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups[cat].map((p) => {
                const configurable = p.product_type === "configurable_paper";
                return (
                  <div key={p.id} data-testid="store-product-card" className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                    {p.image_url
                      ? <img src={authImg(p.image_url)} alt={p.name} className="w-full h-40 object-cover" />
                      : <div className="w-full h-40 bg-slate-100 flex items-center justify-center text-slate-300"><Store size={36} /></div>}
                    <div className="p-5">
                      <div className="font-head font-bold">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</div>}
                      <div className="flex items-center justify-between mt-4">
                        {configurable
                          ? <span className="text-xs font-mono uppercase tracking-widest text-slate-400" data-testid="store-configurable-tag">Choose options</span>
                          : <span className="num text-xl font-black text-[#2495D3]" data-testid="store-product-price">{money(priceOf(p))}</span>}
                        {configurable
                          ? <Button size="sm" onClick={() => nav(`/store/product/${p.id}`)} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="store-configure"><Sliders size={15} className="mr-1" /> Configure</Button>
                          : <Button size="sm" onClick={() => addStatic(p)} className="bg-slate-900 hover:bg-slate-700 rounded-lg" data-testid="store-add-to-cart"><Plus size={15} className="mr-1" /> Add</Button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl" data-testid="store-checkout-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Your order</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">Review items and place your order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-80 overflow-y-auto">
            {cart.items.map((v) => (
              <div key={v.lineKey} data-testid="checkout-line" className="flex items-center justify-between border-b border-slate-100 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-[11px] text-slate-400">{money((v.priceInclTax ?? v.unitPrice) || 0)} incl. tax each</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => cart.setQty(v.lineKey, v.qty - 1)} className="p-1 text-slate-400 hover:text-red-500"><Minus size={13} /></button>
                  <span className="num w-8 text-center">{v.qty}</span>
                  <button onClick={() => cart.setQty(v.lineKey, v.qty + 1)} className="p-1 text-slate-400 hover:text-emerald-600"><Plus size={13} /></button>
                  <button onClick={() => cart.setQty(v.lineKey, 0)} className="p-1 text-slate-400 hover:text-red-500 ml-1"><Trash2 size={14} /></button>
                </div>
                <div className="num font-semibold w-20 text-right">{money(((v.priceInclTax ?? v.unitPrice) || 0) * v.qty)}</div>
              </div>
            ))}
            <div className="pt-2 space-y-1">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="num">{money(cart.total)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">GST</span><span className="num">{money(cart.totalGst)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">PST</span><span className="num">{money(cart.totalPst)}</span></div>
              <div className="flex justify-between font-bold pt-1 border-t border-slate-100"><span>Total incl. tax</span><span className="num text-[#2495D3]" data-testid="checkout-total">{money(cart.totalInclTax)}</span></div>
            </div>
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-lg mt-2" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Keep shopping</Button>
            <Button variant="outline" onClick={() => placeOrder(false)} disabled={placing || cart.count === 0} className="rounded-lg" data-testid="place-order-button">
              {placing ? "Placing…" : "Place order"}
            </Button>
            <Button onClick={() => placeOrder(true)} disabled={placing || cart.count === 0} className="bg-emerald-600 hover:bg-emerald-700 rounded-lg" data-testid="place-and-pay-button">
              <CreditCard size={16} className="mr-1.5" /> {placing ? "…" : "Place & pay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
