import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import {
  FileText, BookOpen, Ruler, Sticker, Printer, Settings, ArrowRight,
  Shirt, Sparkles, Scissors, PanelTop, Type, Users, FolderOpen,
} from "lucide-react";

const CARDS = [
  { to: "/paper", label: "Impresión Papel", desc: "Stocks, productos, imposición y precios", icon: FileText },
  { to: "/booklet", label: "Booklets", desc: "Portada + interiores, encuadernado", icon: BookOpen },
  { to: "/large-format", label: "Gran Formato", desc: "Rollos, nesting y tiling", icon: Ruler },
  { to: "/stickers", label: "Stickers", desc: "1\"–8\", comparación de materiales", icon: Sticker },
  { to: "/dtf", label: "DTF / Playeras", desc: "Impresión DTF + prenda + mano de obra", icon: Shirt },
  { to: "/embroidery", label: "Bordados", desc: "Por puntadas + digitizado", icon: Sparkles },
  { to: "/laser", label: "Láser", desc: "Material + corte + grabado", icon: Scissors },
  { to: "/direct-print", label: "Impresión Directa", desc: "UV en hojas 4x8 / 5x10 + CNC", icon: PanelTop },
  { to: "/channel-letters", label: "Channel Letters", desc: "Letras 6\"–48\" auto-calculadas", icon: Type },
  { to: "/quotes", label: "Cotizaciones", desc: "Cotizaciones guardadas", icon: FolderOpen },
  { to: "/equipment", label: "Equipos", desc: "Tintas y costo real de producción", icon: Printer, admin: true },
  { to: "/users", label: "Usuarios", desc: "Roles: admin, cliente, revendedor", icon: Users, admin: true },
  { to: "/settings", label: "Configuración", desc: "Markups, cargos, precios", icon: Settings, admin: true },
];

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/dashboard").then((r) => setStats(r.data)); }, []);

  const metrics = isAdmin
    ? [
        { label: "Paper Stocks", value: stats.paper_stocks, cap: 100 },
        { label: "Productos", value: stats.products, cap: 250 },
        { label: "Rollos + Hojas", value: (stats.roll_materials || 0) + (stats.sheet_materials || 0) },
        { label: "Cotizaciones", value: stats.quotes },
      ]
    : [
        { label: "Productos", value: stats.products },
        { label: "Materiales Rollo", value: stats.roll_materials },
        { label: "Mis Cotizaciones", value: stats.quotes },
      ];

  const roleTag = { admin: "Administrador", client: "Cliente · precios retail", reseller: "Revendedor · precios wholesale" }[user?.role];

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle={`Print Shop ERP · ${roleTag}`} testid="dashboard-header" />
      <div className="p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-sm overflow-hidden mb-8">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white p-6">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">{m.label}</div>
              <div className="num text-4xl font-black text-[#2495D3] mt-2 tabular">{m.value ?? 0}</div>
              {m.cap && <div className="text-xs text-slate-400 mt-1 font-mono">de {m.cap} máx</div>}
            </div>
          ))}
        </div>

        <h2 className="font-head font-bold text-lg mb-4">Módulos</h2>
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
