import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTour } from "@/context/TourContext";
import { TOURS } from "@/lib/tours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, Plus, Pencil, Trash2, PlayCircle, ExternalLink, Route } from "lucide-react";

const EMPTY_VIDEO = { title_en: "", title_es: "", description_en: "", description_es: "", url: "", category: "general", ref_id: "", ref_label: "", order: 0 };
const EMPTY_SECTION = { group: "getting_started", icon: "book", order: 999, title_en: "", title_es: "", body_en: "", body_es: "" };

export default function Training() {
  const { user } = useAuth();
  const { startTour } = useTour();
  const isAdmin = user?.role === "admin";
  const [lang, setLangState] = useState(() => localStorage.getItem("pns_train_lang") || "es");
  const setLang = (v) => { setLangState(v); localStorage.setItem("pns_train_lang", v); };
  const [manual, setManual] = useState([]);
  const [videos, setVideos] = useState([]);
  const [refs, setRefs] = useState({ product: [], machine: [] });
  const [videoDlg, setVideoDlg] = useState(null);   // video being added/edited
  const [sectionDlg, setSectionDlg] = useState(null);

  const t = (en, es) => (lang === "en" ? en : es);

  const loadAll = async () => {
    try {
      const [m, v] = await Promise.all([api.get("/training/manual"), api.get("/training/videos")]);
      setManual(m.data);
      setVideos(v.data);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [p, mac] = await Promise.all([api.get("/catalog-products"), api.get("/machines")]);
        setRefs({
          product: p.data.map((x) => ({ id: x.id, name: x.name })),
          machine: mac.data.map((x) => ({ id: x.id, name: x.name })),
        });
      } catch (e) { /* non-blocking */ }
    })();
  }, [isAdmin]);

  const saveVideo = async () => {
    const body = { ...videoDlg };
    if (!body.url) { toast.error(t("Video link is required", "El enlace del video es obligatorio")); return; }
    try {
      if (body.id) await api.put(`/training/videos/${body.id}`, body);
      else await api.post("/training/videos", body);
      toast.success(t("Video saved", "Video guardado"));
      setVideoDlg(null); loadAll();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const deleteVideo = async (id) => {
    if (!window.confirm(t("Delete this video?", "¿Eliminar este video?"))) return;
    await api.delete(`/training/videos/${id}`); loadAll();
  };
  const saveSection = async () => {
    const body = { ...sectionDlg };
    try {
      if (body.id) await api.put(`/training/manual/${body.id}`, body);
      else await api.post("/training/manual", body);
      toast.success(t("Section saved", "Sección guardada"));
      setSectionDlg(null); loadAll();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const deleteSection = async (id) => {
    if (!window.confirm(t("Delete this section?", "¿Eliminar esta sección?"))) return;
    await api.delete(`/training/manual/${id}`); loadAll();
  };

  const GROUP_LABEL = {
    getting_started: t("Getting Started", "Primeros Pasos"),
    estimating: t("Estimating", "Cotización"),
    business: t("Business", "Negocio"),
    admin: t("Administration", "Administración"),
  };
  const groups = [...new Set(manual.map((s) => s.group))];

  const openNewVideo = (category) => setVideoDlg({ ...EMPTY_VIDEO, category });

  return (
    <div className="p-8 max-w-6xl" data-testid="training-page">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-[#2495D3]/10 flex items-center justify-center">
            <GraduationCap className="text-[#2495D3]" size={22} />
          </div>
          <div>
            <h1 className="font-head font-black text-2xl tracking-tight">{t("Training Center", "Centro de Entrenamiento")}</h1>
            <p className="text-sm text-slate-500">{t("Learn the software, products and machines.", "Aprende el software, los productos y las máquinas.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border border-slate-300 rounded-md p-0.5" data-testid="lang-toggle">
          {[["es", "ES"], ["en", "EN"]].map(([v, l]) => (
            <button key={v} data-testid={`lang-${v}`} onClick={() => setLang(v)}
              className={`text-xs font-mono px-3 py-1 rounded ${lang === v ? "bg-[#2495D3] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="manual">
        <TabsList data-testid="training-tabs">
          <TabsTrigger value="manual" data-testid="tab-manual">{t("System Manual", "Manual del Sistema")}</TabsTrigger>
          <TabsTrigger value="tours" data-testid="tab-tours">{t("Guided Tours", "Recorridos")}</TabsTrigger>
          <TabsTrigger value="product" data-testid="tab-product">{t("Products", "Productos")}</TabsTrigger>
          <TabsTrigger value="machine" data-testid="tab-machine">{t("Machines", "Máquinas")}</TabsTrigger>
          <TabsTrigger value="general" data-testid="tab-general">{t("General Library", "Biblioteca General")}</TabsTrigger>
        </TabsList>

        {/* MANUAL */}
        <TabsContent value="manual" className="mt-6">
          {isAdmin && (
            <div className="mb-4">
              <Button size="sm" variant="outline" data-testid="add-section-btn" onClick={() => setSectionDlg({ ...EMPTY_SECTION })}>
                <Plus size={15} className="mr-1" /> {t("Add section", "Agregar sección")}
              </Button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g} className="mb-6">
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">{GROUP_LABEL[g] || g}</div>
              <Accordion type="single" collapsible className="space-y-2">
                {manual.filter((s) => s.group === g).map((s) => (
                  <AccordionItem key={s.id} value={s.id} className="border border-slate-200 rounded-md px-4 bg-white" data-testid={`manual-section-${s.id}`}>
                    <AccordionTrigger className="text-left font-semibold hover:no-underline">{t(s.title_en, s.title_es)}</AccordionTrigger>
                    <AccordionContent>
                      <div className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">{t(s.body_en, s.body_es)}</div>
                      {isAdmin && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                          <Button size="sm" variant="ghost" onClick={() => setSectionDlg({ ...s })} data-testid={`edit-section-${s.id}`}><Pencil size={14} className="mr-1" /> {t("Edit", "Editar")}</Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteSection(s.id)}><Trash2 size={14} className="mr-1" /> {t("Delete", "Eliminar")}</Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
          {manual.length === 0 && <p className="text-sm text-slate-500">{t("No content yet.", "Aún no hay contenido.")}</p>}
        </TabsContent>

        {/* GUIDED TOURS */}
        <TabsContent value="tours" className="mt-6">
          <p className="text-sm text-slate-500 mb-4">{t("Interactive step-by-step tours that highlight the real buttons in the system with arrows.", "Recorridos interactivos paso a paso que resaltan los botones reales del sistema con flechas.")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {TOURS.filter((tr) => tr.roles.includes(user?.role)).map((tr) => (
              <div key={tr.id} className="border border-slate-200 rounded-md bg-white p-5 flex flex-col" data-testid={`tour-card-${tr.id}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Route size={16} className="text-[#2495D3]" />
                  <div className="font-semibold text-sm">{t(tr.title_en, tr.title_es)}</div>
                </div>
                <p className="text-sm text-slate-600 flex-1">{t(tr.desc_en, tr.desc_es)}</p>
                <Button size="sm" className="bg-[#2495D3] hover:bg-[#1E7AA9] mt-3 self-start" data-testid={`start-tour-${tr.id}`} onClick={() => startTour(tr.id)}>
                  <PlayCircle size={15} className="mr-1" /> {t("Start tour", "Iniciar recorrido")}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* VIDEO TABS */}
        {["product", "machine", "general"].map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-6">
            {isAdmin && (
              <div className="mb-4">
                <Button size="sm" data-testid={`add-video-${cat}`} className="bg-[#2495D3] hover:bg-[#1E7AA9]" onClick={() => openNewVideo(cat)}>
                  <Plus size={15} className="mr-1" /> {t("Add video", "Agregar video")}
                </Button>
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              {videos.filter((v) => v.category === cat).map((v) => (
                <div key={v.id} className="border border-slate-200 rounded-md bg-white overflow-hidden" data-testid={`video-card-${v.id}`}>
                  <div className="aspect-video bg-slate-900">
                    {v.embed_url ? (
                      <iframe src={v.embed_url} title={v.title_en || v.title_es} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    ) : (
                      <a href={v.url} target="_blank" rel="noreferrer" className="w-full h-full flex flex-col items-center justify-center text-white/80 gap-2">
                        <PlayCircle size={40} /> <span className="text-xs">{t("Open link", "Abrir enlace")}</span>
                      </a>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-sm">{t(v.title_en, v.title_es) || t("Untitled", "Sin título")}</div>
                    {v.ref_label && <div className="text-[11px] text-[#2495D3] font-mono mt-0.5">{v.ref_label}</div>}
                    {t(v.description_en, v.description_es) && <div className="text-sm text-slate-600 mt-1 whitespace-pre-line">{t(v.description_en, v.description_es)}</div>}
                    <div className="flex items-center gap-2 mt-3">
                      <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-[#2495D3] flex items-center gap-1"><ExternalLink size={13} /> {t("Source", "Fuente")}</a>
                      {isAdmin && (
                        <div className="ml-auto flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setVideoDlg({ ...v })} data-testid={`edit-video-${v.id}`}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteVideo(v.id)}><Trash2 size={14} /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {videos.filter((v) => v.category === cat).length === 0 && (
              <p className="text-sm text-slate-500">{t("No videos yet.", "Aún no hay videos.")}</p>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* VIDEO DIALOG */}
      <Dialog open={!!videoDlg} onOpenChange={(o) => !o && setVideoDlg(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="video-dialog">
          <DialogHeader><DialogTitle>{videoDlg?.id ? t("Edit video", "Editar video") : t("Add video", "Agregar video")}</DialogTitle></DialogHeader>
          {videoDlg && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">{t("Video link (YouTube, Vimeo, Drive, OneDrive)", "Enlace del video (YouTube, Vimeo, Drive, OneDrive)")}</Label>
                <Input data-testid="video-url" value={videoDlg.url} onChange={(e) => setVideoDlg({ ...videoDlg, url: e.target.value })} placeholder="https://youtu.be/..." className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Title (EN)</Label><Input data-testid="video-title-en" value={videoDlg.title_en} onChange={(e) => setVideoDlg({ ...videoDlg, title_en: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">Título (ES)</Label><Input data-testid="video-title-es" value={videoDlg.title_es} onChange={(e) => setVideoDlg({ ...videoDlg, title_es: e.target.value })} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Description (EN)</Label><Textarea rows={3} value={videoDlg.description_en} onChange={(e) => setVideoDlg({ ...videoDlg, description_en: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">Descripción (ES)</Label><Textarea rows={3} value={videoDlg.description_es} onChange={(e) => setVideoDlg({ ...videoDlg, description_es: e.target.value })} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t("Category", "Categoría")}</Label>
                  <Select value={videoDlg.category} onValueChange={(val) => setVideoDlg({ ...videoDlg, category: val, ref_id: "", ref_label: "" })}>
                    <SelectTrigger className="mt-1" data-testid="video-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">{t("Product", "Producto")}</SelectItem>
                      <SelectItem value="machine">{t("Machine", "Máquina")}</SelectItem>
                      <SelectItem value="general">{t("General", "General")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(videoDlg.category === "product" || videoDlg.category === "machine") && (
                  <div>
                    <Label className="text-xs">{videoDlg.category === "product" ? t("Linked product", "Producto ligado") : t("Linked machine", "Máquina ligada")}</Label>
                    <Select value={videoDlg.ref_id || ""} onValueChange={(val) => {
                      const item = refs[videoDlg.category].find((x) => x.id === val);
                      setVideoDlg({ ...videoDlg, ref_id: val, ref_label: item?.name || "" });
                    }}>
                      <SelectTrigger className="mt-1" data-testid="video-ref"><SelectValue placeholder={t("Select…", "Seleccionar…")} /></SelectTrigger>
                      <SelectContent>
                        {refs[videoDlg.category].map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoDlg(null)}>{t("Cancel", "Cancelar")}</Button>
            <Button className="bg-[#2495D3] hover:bg-[#1E7AA9]" onClick={saveVideo} data-testid="save-video-btn">{t("Save", "Guardar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SECTION DIALOG */}
      <Dialog open={!!sectionDlg} onOpenChange={(o) => !o && setSectionDlg(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="section-dialog">
          <DialogHeader><DialogTitle>{sectionDlg?.id ? t("Edit section", "Editar sección") : t("Add section", "Agregar sección")}</DialogTitle></DialogHeader>
          {sectionDlg && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Title (EN)</Label><Input value={sectionDlg.title_en} onChange={(e) => setSectionDlg({ ...sectionDlg, title_en: e.target.value })} className="mt-1" data-testid="section-title-en" /></div>
                <div><Label className="text-xs">Título (ES)</Label><Input value={sectionDlg.title_es} onChange={(e) => setSectionDlg({ ...sectionDlg, title_es: e.target.value })} className="mt-1" data-testid="section-title-es" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t("Group", "Grupo")}</Label>
                  <Select value={sectionDlg.group} onValueChange={(val) => setSectionDlg({ ...sectionDlg, group: val })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="getting_started">{t("Getting Started", "Primeros Pasos")}</SelectItem>
                      <SelectItem value="estimating">{t("Estimating", "Cotización")}</SelectItem>
                      <SelectItem value="business">{t("Business", "Negocio")}</SelectItem>
                      <SelectItem value="admin">{t("Administration", "Administración")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">{t("Order", "Orden")}</Label><Input type="number" value={sectionDlg.order} onChange={(e) => setSectionDlg({ ...sectionDlg, order: Number(e.target.value) })} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Body (EN)</Label><Textarea rows={6} value={sectionDlg.body_en} onChange={(e) => setSectionDlg({ ...sectionDlg, body_en: e.target.value })} className="mt-1" data-testid="section-body-en" /></div>
              <div><Label className="text-xs">Contenido (ES)</Label><Textarea rows={6} value={sectionDlg.body_es} onChange={(e) => setSectionDlg({ ...sectionDlg, body_es: e.target.value })} className="mt-1" data-testid="section-body-es" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDlg(null)}>{t("Cancel", "Cancelar")}</Button>
            <Button className="bg-[#2495D3] hover:bg-[#1E7AA9]" onClick={saveSection} data-testid="save-section-btn">{t("Save", "Guardar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
