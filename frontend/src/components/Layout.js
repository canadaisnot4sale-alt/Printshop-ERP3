import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutGrid, FileText, BookOpen, Ruler, Sticker, Printer, Settings as Cog, LogOut,
  Shirt, Sparkles, Scissors, PanelTop, Type, Users as UsersIcon, FolderOpen,
  Coffee, Disc, BookMarked, Cpu, Receipt, LineChart, Droplet, Boxes, Truck,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, testid: "nav-dashboard" },
  { section: "Estimating" },
  { to: "/paper", label: "Paper Printing", icon: FileText, testid: "nav-paper" },
  { to: "/booklet", label: "Booklets", icon: BookOpen, testid: "nav-booklet" },
  { to: "/large-format", label: "Large Format", icon: Ruler, testid: "nav-large-format" },
  { to: "/stickers", label: "Stickers", icon: Sticker, testid: "nav-stickers" },
  { to: "/dtf", label: "DTF / Apparel", icon: Shirt, testid: "nav-dtf" },
  { to: "/embroidery", label: "Embroidery", icon: Sparkles, testid: "nav-embroidery" },
  { to: "/laser", label: "Laser", icon: Scissors, testid: "nav-laser" },
  { to: "/direct-print", label: "Direct Print", icon: PanelTop, testid: "nav-direct-print" },
  { to: "/channel-letters", label: "Channel Letters", icon: Type, testid: "nav-channel-letters" },
  { to: "/sublimation", label: "Sublimation", icon: Coffee, testid: "nav-sublimation" },
  { to: "/roll-stickers", label: "Roll Stickers", icon: Disc, testid: "nav-roll-stickers" },
  { to: "/catalog", label: "Price Catalog", icon: BookMarked, testid: "nav-catalog" },
  { to: "/quotes", label: "My Quotes", icon: FolderOpen, testid: "nav-quotes" },
  { section: "Business", admin: true },
  { to: "/financials", label: "Financials", icon: LineChart, testid: "nav-financials", admin: true },
  { to: "/machinery", label: "Machinery", icon: Cpu, testid: "nav-machinery", admin: true },
  { to: "/materials", label: "Materials", icon: Boxes, testid: "nav-materials", admin: true },
  { to: "/reorder", label: "Reorder Center", icon: Truck, testid: "nav-reorder", admin: true },
  { to: "/fixed-costs", label: "Fixed Costs", icon: Receipt, testid: "nav-fixed-costs", admin: true },
  { to: "/ink-estimator", label: "Ink Estimator", icon: Droplet, testid: "nav-ink-estimator", admin: true },
  { section: "Administration", admin: true },
  { to: "/equipment", label: "Equipment", icon: Printer, testid: "nav-equipment", admin: true },
  { to: "/users", label: "Users", icon: UsersIcon, testid: "nav-users", admin: true },
  { to: "/settings", label: "Settings", icon: Cog, testid: "nav-settings", admin: true },
];

const ROLE_LABEL = { admin: "Administrator", client: "Client (Retail)", reseller: "Reseller (Wholesale)" };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col fixed h-screen print:hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <img src="/logo.webp" alt="Print and Save" className="w-9 h-9 object-contain" />
          <div>
            <div className="font-head font-black text-base leading-none tracking-tight">Print and Save</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono tracking-wide">YOUR BRAND IN FOCUS</div>
          </div>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.filter((n) => !n.admin || isAdmin).map((n, i) =>
            n.section ? (
              <div key={i} className="px-5 pt-4 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-400">{n.section}</div>
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#2495D3]/10 text-[#2495D3] border-l-2 border-[#2495D3]"
                      : "text-slate-600 hover:bg-slate-50 border-l-2 border-transparent"
                  }`
                }
              >
                <n.icon size={16} />
                {n.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="text-xs text-slate-700 font-medium truncate" data-testid="current-user-email">{user?.email}</div>
          <div className="text-[10px] text-[#2495D3] font-mono mb-2" data-testid="current-user-role">{ROLE_LABEL[user?.role] || user?.role}</div>
          <button
            data-testid="logout-button"
            onClick={async () => { await logout(); nav("/login"); }}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-500 transition-colors"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 min-h-screen print:ml-0">
        <div className="hidden print:flex items-center gap-3 px-8 py-4 border-b-2 border-[#2495D3] mb-2">
          <img src="/logo.webp" alt="Print and Save" className="w-12 h-12 object-contain" />
          <div>
            <div className="font-head font-black text-xl">Print and Save</div>
            <div className="text-xs text-slate-500 font-mono tracking-widest uppercase">Your Brand in Focus</div>
          </div>
          <div className="ml-auto text-xs text-slate-500 font-mono">Quote · {new Date().toLocaleDateString()}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
