import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const KEY = "pns_quote_cart";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const addItem = (item) =>
    setItems((prev) => [...prev, { id: crypto.randomUUID(), qty: 1, ...item }]);
  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
  const setQty = (id, qty) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  const clear = () => setItems([]);
  const total = items.reduce((a, i) => a + (i.price || 0) * (i.qty || 1), 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, setQty, clear, total }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
