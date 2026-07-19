import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import QuoteDetailDialog from "@/components/QuoteDetailDialog";
import { money } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight } from "lucide-react";

const priceOf = (s) => s?.retail_total ?? s?.customer_price ?? s?.wholesale_total ?? s?.wholesale_price ??
  s?.results?.[0]?.retail_total ?? s?.results?.[0]?.wholesale_total ??
  s?.total?.selling_price ?? s?.total?.wholesale_price ?? s?.selling_price;

export default function Catalog() {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("");
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { api.get("/quotes").then((r) => setQuotes(r.data)); }, []);

  const openQuote = (q) => { setSelected(q); setOpen(true); };

  const items = useMemo(() => {
    const map = {};
    quotes.forEach((q) => {
      const key = (q.title || "Untitled").trim();
      if (!map[key] || new Date(q.created_at) > new Date(map[key].created_at)) map[key] = q;
    });
    return Object.values(map).sort((a, b) => a.title.localeCompare(b.title));
  }, [quotes]);

  const filtered = items.filter((q) => {
    const t = q.title.toLowerCase();
    const cust = (q.customer_name || "").toLowerCase();
    const term = search.toLowerCase();
    if (search && !t.includes(term) && !cust.includes(term)) return false;
    if (letter && t[0]?.toUpperCase() !== letter) return false;
    return true;
  });

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const available = new Set(items.map((q) => q.title[0]?.toUpperCase()));

  const groups = {};
  filtered.forEach((q) => {
    const L = q.title[0]?.toUpperCase() || "#";
    (groups[L] = groups[L] || []).push(q);
  });

  return (
    <div data-testid="catalog-page">
      <PageHeader title="Price Catalog" eyebrow="Saved Products" subtitle="Every quoted product, alphabetical — click any item to see full specifications">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <Input data-testid="catalog-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or customer…" className="rounded-lg pl-8 w-64" />
        </div>
      </PageHeader>
      <div className="p-8 flex gap-6">
        <div className="flex flex-col gap-1 shrink-0" data-testid="catalog-az">
          <button onClick={() => setLetter("")} className={`w-7 h-7 text-xs font-mono rounded-md ${letter === "" ? "bg-[#2495D3] text-white" : "text-slate-500 hover:bg-slate-100"}`}>All</button>
          {letters.map((L) => (
            <button key={L} disabled={!available.has(L)} onClick={() => setLetter(L)}
              data-testid={`letter-${L}`}
              className={`w-7 h-7 text-xs font-mono rounded-md ${letter === L ? "bg-[#2495D3] text-white" : available.has(L) ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 cursor-default"}`}>
              {L}
            </button>
          ))}
        </div>
        <div className="flex-1">
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">No quoted products yet. Save a quote from any calculator and it appears here.</div>
          ) : (
            Object.keys(groups).sort().map((L) => (
              <div key={L} className="mb-6">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#2495D3] mb-2">{L}</div>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <tbody>
                      {groups[L].map((q) => (
                        <tr key={q.id} data-testid="catalog-row" onClick={() => openQuote(q)}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer group">
                          <td className="px-4 py-3 font-medium">{q.title}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs"><span className="text-[10px] font-mono uppercase bg-slate-100 px-2 py-0.5 rounded-md">{q.module}</span></td>
                          <td className="px-4 py-3 text-slate-400 text-xs num">{new Date(q.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right num tabular text-[#2495D3] font-bold">{priceOf(q.summary) != null ? money(priceOf(q.summary)) : "—"}</td>
                          <td className="px-2 py-3 text-slate-300 group-hover:text-[#2495D3]"><ChevronRight size={16} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <QuoteDetailDialog quote={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
