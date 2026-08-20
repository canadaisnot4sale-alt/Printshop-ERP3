import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API } from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShoppingBag } from "lucide-react";

const authImg = (u) => (u ? (u.startsWith("http") ? u : `${API}${u}?auth=${localStorage.getItem("pns_token")}`) : null);

export default function StoreHome() {
  const nav = useNavigate();
  const [products, setProducts] = useState([]);

  useEffect(() => { api.get("/catalog-products").then(({ data }) => setProducts(data.filter((p) => p.published))); }, []);

  const cats = [...new Set(products.map((p) => p.category || "Other"))];
  const go = (p) => nav(p.product_type === "configurable_paper" ? `/store/product/${p.id}` : "/store");

  return (
    <div data-testid="store-home">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2495D3] via-[#1E7AA9] to-[#0f4c66]" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32 text-white">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/70 mb-4">Print and Save</p>
          <h1 className="font-head font-black text-4xl sm:text-5xl lg:text-6xl max-w-2xl leading-tight">Browse our latest products</h1>
          <p className="mt-4 text-white/80 max-w-lg text-base">Business cards, flyers, banners and more — configured your way, priced instantly.</p>
          <Button onClick={() => nav("/store")} className="mt-8 bg-white text-[#0f4c66] hover:bg-white/90 rounded-full h-12 px-8 text-base font-semibold" data-testid="hero-shop-all">
            Shop all <ArrowRight size={18} className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Categories */}
      {cats.length > 1 && (
        <section className="max-w-6xl mx-auto px-6 pt-12">
          <div className="flex flex-wrap gap-2" data-testid="store-categories">
            {cats.map((c) => (
              <button key={c} onClick={() => nav("/store")} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:border-[#2495D3] hover:text-[#2495D3] transition-colors">{c}</button>
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="font-head font-black text-2xl mb-6">Products</h2>
        {products.length === 0 ? (
          <div className="text-slate-400 py-16 text-center border border-dashed border-slate-200 rounded-2xl">No products yet — check back soon.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" data-testid="store-home-grid">
            {products.map((p) => {
              const configurable = p.product_type === "configurable_paper";
              const price = p.your_price ?? p.price ?? 0;
              return (
                <button key={p.id} onClick={() => go(p)} data-testid="home-product-card"
                  className="text-left group rounded-2xl overflow-hidden border border-slate-200 hover:shadow-lg transition-all">
                  <div className="aspect-square bg-slate-100 overflow-hidden">
                    {p.image_url
                      ? <img src={authImg(p.image_url)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag size={44} /></div>}
                  </div>
                  <div className="p-4">
                    <div className="font-medium text-sm line-clamp-1">{p.name}</div>
                    <div className="text-[11px] text-slate-400 mb-1">{p.category}</div>
                    <div className="num font-bold text-[#2495D3]">{configurable ? "From options" : money(price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
