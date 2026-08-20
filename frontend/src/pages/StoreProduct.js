import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { useStoreCart } from "@/context/StoreCartContext";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, ShoppingBag, ChevronDown, Check } from "lucide-react";

const SIDE_LABEL = { "4_0": "One side", "4_4": "Both sides" };
const ADDON_LABEL = {
  lamination: ["Lamination", "Stronger, premium finish"],
  hot_foil: ["Hot Foil", "Shiny gold/metallic accents"],
  round_corners: ["Round Corners", "Soft rounded edges"],
};

export default function StoreProduct() {
  const { id } = useParams();
  const nav = useNavigate();
  const cart = useStoreCart();

  const [product, setProduct] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const [qty, setQty] = useState(100);
  const [sides, setSides] = useState("4_0");
  const [addons, setAddons] = useState({ lamination: false, hot_foil: false, round_corners: false });
  const [paperId, setPaperId] = useState(null);

  const fetchPrice = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/store/paper-price", {
        product_id: id, quantity: qty, sides,
        laminate: !!addons.lamination, hot_foil: !!addons.hot_foil, round_corners: !!addons.round_corners,
      });
      setProduct(data.product);
      setCfg(data.config);
      setOptions(data.options || []);
      setPaperId((prev) => {
        if (prev && (data.options || []).some((o) => o.paper_id === prev)) return prev;
        const def = (data.options || []).find((o) => o.is_default) || (data.options || [])[0];
        return def ? def.paper_id : null;
      });
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setLoading(false); }
  }, [id, qty, sides, addons]);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const selected = options.find((o) => o.paper_id === paperId);
  const allowedAddons = cfg?.addons || {};
  const showAddon = (k) => allowedAddons[k];

  const addToCart = () => {
    if (!selected) return;
    const lineKey = `${id}|${paperId}|${qty}|${sides}|${addons.lamination ? 1 : 0}${addons.hot_foil ? 1 : 0}${addons.round_corners ? 1 : 0}`;
    const extras = [addons.lamination && "Lam", addons.hot_foil && "Foil", addons.round_corners && "Round"].filter(Boolean).join(", ");
    const label = `${product?.name} · ${selected.paper_name} · ${qty} pcs · ${SIDE_LABEL[sides]}${extras ? ` · ${extras}` : ""}`;
    cart.add({
      lineKey, product_id: id, name: label, unitPrice: selected.price, priceInclTax: selected.price_incl_tax,
      gst: selected.gst, pst: selected.pst, qty: 1,
      config: { quantity: qty, sides, paper_id: paperId, laminate: !!addons.lamination, hot_foil: !!addons.hot_foil, round_corners: !!addons.round_corners },
    });
    toast.success("Added to cart");
    nav("/store");
  };

  const quantities = cfg?.quantities || [25, 50, 100, 250, 500, 1000, 2500, 5000];
  const sideOpts = cfg?.sides || ["4_0", "4_4"];

  return (
    <div data-testid="store-product-page" className="max-w-5xl mx-auto p-6 pb-28">
      <button onClick={() => nav("/store")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4" data-testid="store-back">
        <ArrowLeft size={16} /> Back to store
      </button>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          {product?.image_url
            ? <img src={product.image_url} alt={product?.name} className="w-full rounded-2xl object-cover aspect-square" />
            : <div className="w-full rounded-2xl bg-slate-100 aspect-square flex items-center justify-center text-slate-300"><ShoppingBag size={64} /></div>}
        </div>

        <div className="space-y-7">
          <div>
            <h1 className="font-head font-black text-3xl">{product?.name || "…"}</h1>
            {product?.description && <p className="text-slate-500 mt-1">{product.description}</p>}
          </div>

          {/* Quantity */}
          <div>
            <div className="text-sm font-semibold mb-2">How many?</div>
            <div className="flex flex-wrap gap-2" data-testid="sp-quantities">
              {quantities.map((q) => (
                <button key={q} onClick={() => setQty(q)} data-testid={`sp-qty-${q}`}
                  className={`num rounded-full px-5 py-2 text-sm border transition-colors ${qty === q ? "bg-[#2495D3] text-white border-[#2495D3]" : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"}`}>{q}</button>
              ))}
            </div>
          </div>

          {/* Sides */}
          {sideOpts.length > 1 && (
            <div>
              <div className="text-sm font-semibold mb-2">Printing</div>
              <div className="grid grid-cols-2 gap-3" data-testid="sp-sides">
                {sideOpts.map((sv) => (
                  <button key={sv} onClick={() => setSides(sv)} data-testid={`sp-side-${sv}`}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${sides === sv ? "border-[#2495D3] ring-1 ring-[#2495D3] bg-blue-50/40" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="font-semibold text-sm">{SIDE_LABEL[sv]}</div>
                    <div className="text-[11px] text-slate-400">{sv === "4_0" ? "Front only" : "Front & back"}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {["lamination", "hot_foil", "round_corners"].some(showAddon) && (
            <div>
              <div className="text-sm font-semibold mb-2">Extras</div>
              <div className="space-y-2" data-testid="sp-addons">
                {["lamination", "hot_foil", "round_corners"].filter(showAddon).map((k) => (
                  <div key={k} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium">{ADDON_LABEL[k][0]}</div>
                      <div className="text-[11px] text-slate-400">{ADDON_LABEL[k][1]}</div>
                    </div>
                    <Switch data-testid={`sp-addon-${k}`} checked={!!addons[k]} onCheckedChange={(v) => setAddons((a) => ({ ...a, [k]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paper choice with live prices */}
          <div>
            <div className="text-sm font-semibold mb-2">Choose your paper</div>
            <div className="grid sm:grid-cols-2 gap-3" data-testid="sp-papers">
              {options.map((o, idx) => {
                const isSel = o.paper_id === paperId;
                return (
                  <button key={o.paper_id} onClick={() => setPaperId(o.paper_id)} data-testid="sp-paper-option"
                    className={`text-left rounded-xl border p-4 transition-all relative ${isSel ? "border-[#2495D3] ring-2 ring-[#2495D3]" : "border-slate-200 hover:border-slate-300"}`}>
                    {isSel && <span className="absolute top-3 right-3 text-[#2495D3]"><Check size={16} /></span>}
                    <div className="flex items-center gap-2">
                      <div className="font-head font-bold text-sm">{o.paper_name}</div>
                      {o.is_default && <span className="text-[9px] font-mono uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Popular</span>}
                      {idx === 0 && !o.is_default && <span className="text-[9px] font-mono uppercase bg-emerald-500 text-white px-1.5 py-0.5 rounded">Best price</span>}
                    </div>
                    <div className="num text-2xl font-black text-[#2495D3] mt-2">{money(o.price_incl_tax)}</div>
                    <div className="text-[11px] text-slate-400">incl. tax · {money((o.price_incl_tax || 0) / (qty || 1))}/unit</div>
                  </button>
                );
              })}
              {options.length === 0 && !loading && <div className="text-sm text-slate-400 col-span-2 py-6 text-center">No papers available for these options.</div>}
            </div>
          </div>

          {/* Tax breakdown for the selected paper */}
          {selected && (
            <div className="rounded-xl border border-slate-200 p-4" data-testid="sp-tax-breakdown">
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">Subtotal</span><span className="num">{money(selected.subtotal)}</span></div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">GST {cfg?.gst_pct}%</span><span className="num">{money(selected.gst)}</span></div>
              <div className="flex justify-between text-sm py-0.5"><span className="text-slate-500">PST {cfg?.pst_pct}%</span><span className="num">{cfg?.role === "reseller" ? "—" : money(selected.pst)}</span></div>
              <div className="flex justify-between text-base font-bold pt-1.5 border-t border-slate-100 mt-1"><span>Total incl. tax</span><span className="num text-[#2495D3]">{money(selected.price_incl_tax)}</span></div>
            </div>
          )}

          {/* Technical details (collapsible) */}
          <div>
            <button onClick={() => setShowTech((s) => !s)} className="flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-slate-400 hover:text-slate-600" data-testid="sp-tech-toggle">
              Technical details <ChevronDown size={14} className={`transition-transform ${showTech ? "rotate-180" : ""}`} />
            </button>
            {showTech && selected && (
              <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1" data-testid="sp-tech-block">
                <div>Paper: <b>{selected.paper_name}</b></div>
                <div>Quantity: <b>{qty}</b> pcs · {SIDE_LABEL[sides]}</div>
                <div>Imposition: <b>{selected.n_up}</b>-up · <b>{selected.sheets}</b> sheets</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky add bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3 flex items-center justify-between z-20" data-testid="sp-sticky-bar">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400">Total incl. tax</div>
          <div className="num text-2xl font-black text-slate-900" data-testid="sp-total">{selected ? money(selected.price_incl_tax) : "—"}</div>
        </div>
        <Button onClick={addToCart} disabled={!selected || loading} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-xl h-12 px-8 text-base" data-testid="sp-add-to-cart">
          <ShoppingBag size={18} className="mr-2" /> Add to cart
        </Button>
      </div>
    </div>
  );
}
