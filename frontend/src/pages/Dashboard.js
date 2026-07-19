import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import {
  FileText, BookOpen, Ruler, Sticker, Printer, Settings, ArrowRight,
  Shirt, Sparkles, Scissors, PanelTop, Type, Users, FolderOpen,
  Coffee, Disc, BookMarked,
} from "lucide-react";

const CARDS = [
  { to: "/paper", label: "Paper Printing", desc: "Stocks, products, imposition & pricing", icon: FileText },
  { to: "/booklet", label: "Booklets", desc: "Cover + inside paper, binding", icon: BookOpen },
  { to: "/large-format", label: "Large Format", desc: "Roll media, nesting & tiling", icon: Ruler },
  { to: "/stickers", label: "Stickers", desc: "1\"–8\", material comparison", icon: Sticker },
  { to: "/dtf", label: "DTF / Apparel", desc: "DTF print + garment + labor", icon: Shirt },
  { to: "/embroidery", label: "Embroidery", desc: "Per stitch + digitizing", icon: Sparkles },
  { to: "/laser", label: "Laser", desc: "Material + cut + engraving", icon: Scissors },
  { to: "/direct-print", label: "Direct Print", desc: "UV on 4x8 / 5x10 sheets + CNC", icon: PanelTop },
  { to: "/channel-letters", label: "Channel Letters", desc: "Auto-nested letter faces", icon: Type },
  { to: "/sublimation", label: "Sublimation", desc: "Mugs, frames, keychains + paper calc", icon: Coffee },
  { to: "/roll-stickers", label: "Roll Stickers", desc: "Label rolls + ink cleaning waste", icon: Disc },
  { to: "/catalog", label: "Price Catalog", desc: "All quoted products, A–Z", icon: BookMarked },
  { to: "/quotes", label: "Quotes", desc: "Saved quotes", icon: FolderOpen },
  { to: "/equipment", label: "Equipment", desc: "Ink & true production cost", icon: Printer, admin: true },
  { to: "/users", label: "Users", desc: "Roles: admin, client, reseller", icon: Users, admin: true },
  { to: "/settings", label: "Settings", desc: "Markups, charges, pricing", icon: Settings, admin: true },
];

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/dashboard").then((r) => setStats(r.data)); }, []);

  const metrics = isAdmin
    ? [
        { label: "Paper Stocks", value: stats.paper_stocks, cap: 100 },
        { label: "Products", value: stats.products, cap: 250 },
        { label: "Rolls + Sheets", value: (stats.roll_materials || 0) + (stats.sheet_materials || 0) },
        { label: "Quotes", value: stats.quotes },
      ]
    : [
        { label: "Products", value: stats.products },
        { label: "Roll Materials", value: stats.roll_materials },
        { label: "My Quotes", value: stats.quotes },
      ];

  const roleTag = { admin: "Administrator", client: "Client · retail pricing", reseller: "Reseller · wholesale pricing" }[user?.role];

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle={`Print Shop ERP · ${roleTag}`} testid="dashboard-header" />
      <div className="p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-sm overflow-hidden mb-8">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white p-6">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">{m.label}</div>
              <div className="num text-4xl font-black text-[#2495D3] mt-2 tabular">{m.value ?? 0}</div>
              {m.cap && <div className="text-xs text-slate-400 mt-1 font-mono">of {m.cap} max</div>}
            </div>
          ))}
        </div>

        <h2 className="font-head font-bold text-lg mb-4">Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.filter((c) => !c.admin || isAdmin).map((c) => (
            <Link
              key={c.to}
              to={c.to}
              data-testid={`module-card-${c.to.replace("/", "")}`}
              className="group bg-white border border-slate-200 rounded-sm p-6 hover:-translate-y-px hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-sm bg-[#2495D3]/10 text-[#2495D3] flex items-center justify-center">
                  <c.icon size={20} />
                </div>
                <ArrowRight size={18} className="text-slate-300 group-hover:text-[#2495D3] transition-colors" />
              </div>
              <div className="font-head font-bold text-base mt-4">{c.label}</div>
              <div className="text-sm text-slate-500 mt-1">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
