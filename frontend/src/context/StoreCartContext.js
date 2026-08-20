import { createContext, useContext, useEffect, useState } from "react";

// Shopping cart for the storefront (separate from the Quote Builder cart). Supports both static
// products and configurable paper lines (each configuration is its own line via lineKey).
const StoreCartContext = createContext(null);
const KEY = "pns_store_cart";

export function StoreCartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add = (item) => setItems((prev) => {
    const i = prev.findIndex((x) => x.lineKey === item.lineKey);
    if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + (item.qty || 1) }; return n; }
    return [...prev, { qty: 1, ...item }];
  });
  const setQty = (lineKey, qty) => setItems((prev) =>
    qty <= 0 ? prev.filter((x) => x.lineKey !== lineKey)
             : prev.map((x) => (x.lineKey === lineKey ? { ...x, qty } : x)));
  const remove = (lineKey) => setItems((prev) => prev.filter((x) => x.lineKey !== lineKey));
  const clear = () => setItems([]);
  const total = items.reduce((a, i) => a + (i.unitPrice || 0) * (i.qty || 1), 0);
  const totalInclTax = items.reduce((a, i) => a + ((i.priceInclTax ?? i.unitPrice) || 0) * (i.qty || 1), 0);
  const count = items.reduce((a, i) => a + (i.qty || 1), 0);

  return (
    <StoreCartContext.Provider value={{ items, add, setQty, remove, clear, total, totalInclTax, count }}>
      {children}
    </StoreCartContext.Provider>
  );
}
export const useStoreCart = () => useContext(StoreCartContext);
