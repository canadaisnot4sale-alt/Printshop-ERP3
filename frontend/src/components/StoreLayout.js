import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useStoreCart } from "@/context/StoreCartContext";
import { ShoppingBag, User, Search, LogOut } from "lucide-react";
import { useState } from "react";

export default function StoreLayout({ children }) {
  const { user, logout, realRole, setViewAs } = useAuth();
  const cart = useStoreCart();
  const nav = useNavigate();
  const [acct, setAcct] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col" data-testid="store-layout">
      {realRole === "admin" && (
        <div className="bg-amber-400 text-amber-950 text-center text-xs py-1.5 font-semibold" data-testid="store-admin-preview">
          Admin preview — viewing the storefront as a customer.
          <button onClick={() => setViewAs("admin")} className="underline ml-2 font-bold" data-testid="store-exit-preview">Exit to Admin</button>
        </div>
      )}
      <div className="bg-[#2495D3] text-white text-center text-[13px] py-2 font-medium tracking-wide">
        Welcome to Print and Save — real print, real fast
      </div>

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="store-logo">
            <img src="/logo.webp" alt="Print and Save" className="w-8 h-8 object-contain" />
            <span className="font-head font-black text-lg tracking-tight">Print and Save</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <NavLink to="/" end className={({ isActive }) => isActive ? "text-[#2495D3]" : "hover:text-slate-900"} data-testid="store-nav-home">Home</NavLink>
            <NavLink to="/store" className={({ isActive }) => isActive ? "text-[#2495D3]" : "hover:text-slate-900"} data-testid="store-nav-shop">Shop all</NavLink>
            <NavLink to="/orders" className={({ isActive }) => isActive ? "text-[#2495D3]" : "hover:text-slate-900"} data-testid="store-nav-orders">My orders</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <button onClick={() => nav("/store")} className="text-slate-500 hover:text-slate-900" title="Search" data-testid="store-search-btn"><Search size={19} /></button>
            <div className="relative">
              <button onClick={() => setAcct((v) => !v)} className="text-slate-500 hover:text-slate-900" data-testid="store-account-btn"><User size={19} /></button>
              {acct && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-2 text-sm" data-testid="store-account-menu">
                  <div className="px-3 py-1.5 text-xs text-slate-400 truncate">{user?.email}</div>
                  <button onClick={() => { setAcct(false); nav("/orders"); }} className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-50">My orders</button>
                  <button onClick={async () => { await logout(); nav("/login"); }} className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-50 text-red-500 flex items-center gap-2"><LogOut size={14} /> Sign out</button>
                </div>
              )}
            </div>
            <button onClick={() => nav("/store")} className="relative text-slate-700 hover:text-[#2495D3]" data-testid="store-cart-icon">
              <ShoppingBag size={20} />
              {cart.count > 0 && <span className="absolute -top-2 -right-2 bg-[#2495D3] text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 px-1 num">{cart.count}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 mt-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <img src="/logo.webp" alt="" className="w-6 h-6 object-contain" />
            <span className="font-head font-bold text-slate-700">Print and Save</span>
          </div>
          <div className="font-mono text-xs tracking-widest uppercase">Your brand in focus</div>
          <div className="text-xs">© {new Date().getFullYear()} Print and Save</div>
        </div>
      </footer>
    </div>
  );
}
