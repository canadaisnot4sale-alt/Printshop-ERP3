import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { FileText, BookOpen, Ruler, Sticker, Printer, Settings, ArrowRight } from "lucide-react";

const CARDS = [
  { to: "/paper", label: "Paper Printing", desc: "Stocks, products, imposition & pricing", icon: FileText, key: "paper_stocks", unit: "stocks" },
  { to: "/booklet", label: "Booklets", desc: "Cover + inside paper, binding options", icon: BookOpen, key: null },
  { to: "/large-format", label: "Large Format", desc: "Roll media, nesting & tiling", icon: Ruler, key: "roll_materials", unit: "materials" },
  { to: "/stickers", label: "Stickers", desc: "1\"–8\" sticker pricing comparison", icon: Sticker, key: "sticker_materials", unit: "materials" },
  { to: "/equipment", label: "Equipment", desc: "Printers, ink & production cost", icon: Printer, key: "equipment", unit: "printers" },
  { to: "/settings", label: "Settings", desc: "Markups, click charges, lamination", icon: Settings, key: null },
];

export default function Dashboard() {
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/dashboard").then((r) => setStats(r.data)); }, []);

  const metrics = [
    { label: "Paper Stocks", value: stats.paper_stocks, cap: 100 },
    { label: "Products", value: stats.products, cap: 250 },
    { label: "Roll Materials", value: stats.roll_materials, cap: 100 },
    { label: "Equipment", value: stats.equipment },
  ];

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle="Print Shop ERP & Estimating overview" testid="dashboard-header" />
      <div className="p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-sm overflow-hidden mb-8">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white p-6" data-testid={`metric-${m.label.toLowerCase().replace(/ /g, "-")}`}>
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">{m.label}</div>
              <div className="num text-4xl font-black text-[#2495D3] mt-2 tabular">{m.value ?? 0}</div>
              {m.cap && <div className="text-xs text-slate-400 mt-1 font-mono">of {m.cap} max</div>}
            </div>
          ))}
        </div>

        <h2 className="font-head font-bold text-lg mb-4">Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((c) => (
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
              {c.key && (
                <div className="text-xs font-mono text-slate-400 mt-3">
                  {stats[c.key] ?? 0} {c.unit}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
