import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutGrid, FileText, BookOpen, Ruler, Sticker, Printer, Settings as Cog, LogOut,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, testid: "nav-dashboard" },
  { to: "/paper", label: "Paper Printing", icon: FileText, testid: "nav-paper" },
  { to: "/booklet", label: "Booklets", icon: BookOpen, testid: "nav-booklet" },
  { to: "/large-format", label: "Large Format", icon: Ruler, testid: "nav-large-format" },
  { to: "/stickers", label: "Stickers", icon: Sticker, testid: "nav-stickers" },
  { to: "/equipment", label: "Equipment", icon: Printer, testid: "nav-equipment" },
  { to: "/settings", label: "Settings", icon: Cog, testid: "nav-settings" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col fixed h-screen">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="font-head font-black text-lg leading-none tracking-tight">
            Print <span className="text-[#2495D3]">and</span> Save
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tracking-wide">
            YOUR BRAND IN FOCUS
          </div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#2495D3]/10 text-[#2495D3] border-l-2 border-[#2495D3]"
                    : "text-slate-600 hover:bg-slate-50 border-l-2 border-transparent"
                }`
              }
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-2 truncate" data-testid="current-user-email">
            {user?.email}
          </div>
          <button
            data-testid="logout-button"
            onClick={async () => { await logout(); nav("/login"); }}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-500 transition-colors"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 min-h-screen">{children}</main>
    </div>
  );
}
