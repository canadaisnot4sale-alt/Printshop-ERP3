import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShoppingBag, Plus, Minus, Trash2, Store } from "lucide-react";

export default function Storefront() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => { api.get("/catalog-products").then(({ data }) => setProducts(data.filter((p) => p.published))); }, []);

  const priceOf = (p) => p.your_price ?? p.price ?? 0;
  const add = (p) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty || 0) + 1 } }));
  const setQty = (id, qty) => setCart((c) => {
    if (qty <= 0) { const n = { ...c }; delete n[id]; return n; }
    return { ...c, [id]: { ...c[id], qty } };
  });
  const entries = Object.entries(cart);
  const total = entries.reduce((a, [, v]) => a + priceOf(v.product) * v.qty, 0);
  const count = entries.reduce((a, [, v]) => a + v.qty, 0);

  const placeOrder = async () => {
    setPlacing(true);
    try {
      await api.post("/orders", {
        items: entries.map(([id, v]) => ({ product_id: id, qty: v.qty })),
        notes,
      });
      toast.success("Order placed!");
      setCart({}); setNotes(""); setOpen(false);
      nav("/orders");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setPlacing(false); }
  };

  const groups = {};
  products.forEach((p) => (groups[p.category || "Other"] = groups[p.category || "Other"] || []).push(p));

  return (
    <div data-testid="storefront-page">
      <PageHeader title="Store" eyebrow="Shop"
        subtitle="Browse published products and place an order.">
        <Button onClick={() => setOpen(true)} disabled={count === 0} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="store-cart-button">
          <ShoppingBag size={16} className="mr-1.5" /> Cart ({count}) · {money(total)}
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
              {groups[cat].map((p) => (
                <div key={p.id} data-testid="store-product-card" className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="font-head font-bold">{p.name}</div>
                  {p.description && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</div>}
                  <div className="flex items-center justify-between mt-4">
                    <span className="num text-xl font-black text-[#2495D3]" data-testid="store-product-price">{money(priceOf(p))}</span>
                    <Button size="sm" onClick={() => add(p)} className="bg-slate-900 hover:bg-slate-700 rounded-lg" data-testid="store-add-to-cart"><Plus size={15} className="mr-1" /> Add</Button>
                  </div>
                  {user?.role === "admin" && p.wholesale_price ? <div className="text-[10px] text-slate-400 mt-1">wholesale {money(p.wholesale_price)}</div> : null}
                </div>
              ))}
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
            {entries.map(([id, v]) => (
              <div key={id} data-testid="checkout-line" className="flex items-center justify-between border-b border-slate-100 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{v.product.name}</div>
                  <div className="text-[11px] text-slate-400">{money(priceOf(v.product))} each</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(id, v.qty - 1)} className="p-1 text-slate-400 hover:text-red-500"><Minus size={13} /></button>
                  <span className="num w-8 text-center">{v.qty}</span>
                  <button onClick={() => setQty(id, v.qty + 1)} className="p-1 text-slate-400 hover:text-emerald-600"><Plus size={13} /></button>
                  <button onClick={() => setQty(id, 0)} className="p-1 text-slate-400 hover:text-red-500 ml-1"><Trash2 size={14} /></button>
                </div>
                <div className="num font-semibold w-20 text-right">{money(priceOf(v.product) * v.qty)}</div>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-bold">
              <span>Total</span><span className="num text-[#2495D3]" data-testid="checkout-total">{money(total)}</span>
            </div>
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-lg mt-2" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Keep shopping</Button>
            <Button onClick={placeOrder} disabled={placing || count === 0} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="place-order-button">
              {placing ? "Placing…" : "Place order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
