import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Video, Plus, Trash2, ExternalLink } from "lucide-react";

const EMPTY = { title_en: "", title_es: "", description_en: "", description_es: "", url: "", customer_visible: false };

export default function TrainingVideoManager({ category, refId, refLabel, variant = "icon" }) {
  const es = (localStorage.getItem("pns_train_lang") || "es") !== "en";
  const t = (en, esT) => (es ? esT : en);
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/training/videos", { params: { category, ref_id: refId } });
      setVideos(data);
    } catch (e) { /* ignore */ }
  };
  const openDlg = () => { setOpen(true); setForm(EMPTY); setAdding(false); load(); };
  const save = async () => {
    if (!form.url) { toast.error(t("Video link required", "El enlace del video es obligatorio")); return; }
    try {
      await api.post("/training/videos", { ...form, category, ref_id: refId, ref_label: refLabel });
      toast.success(t("Video added", "Video agregado"));
      setForm(EMPTY); setAdding(false); load();
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };
  const del = async (id) => {
    if (!window.confirm(t("Delete this video?", "¿Eliminar este video?"))) return;
    await api.delete(`/training/videos/${id}`); load();
  };
  const toggleVisible = async (v, val) => {
    try { await api.put(`/training/videos/${v.id}`, { ...v, customer_visible: val }); load(); }
    catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
  };

  return (
    <>
      {variant === "icon" ? (
        <button onClick={openDlg} className="p-1.5 text-slate-400 hover:text-[#2495D3]" title={t("Training videos", "Videos de entrenamiento")} data-testid={`video-manager-${refId}`}>
          <Video size={15} />
        </button>
      ) : (
        <Button size="sm" variant="outline" onClick={openDlg} data-testid={`video-manager-${refId}`}>
          <Video size={14} className="mr-1" /> {t("Videos", "Videos")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="video-manager-dialog">
          <DialogHeader><DialogTitle>{t("Training videos", "Videos de entrenamiento")} — {refLabel}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{t("Paste a YouTube (unlisted), Vimeo, Drive or OneDrive link. Employees will see it in the Training Center.", "Pega un enlace de YouTube (no listado), Vimeo, Drive o OneDrive. Los empleados lo verán en el Centro de Entrenamiento.")}</p>
            {videos.length === 0 && !adding && <p className="text-sm text-slate-500">{t("No videos yet for this item.", "Aún no hay videos para este elemento.")}</p>}
            {videos.map((v) => (
              <div key={v.id} className="flex items-center gap-2 border border-slate-200 rounded-md p-2" data-testid={`vm-item-${v.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{(es ? v.title_es : v.title_en) || v.url}</div>
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-[#2495D3] flex items-center gap-1"><ExternalLink size={11} /> {t("Open", "Abrir")}</a>
                </div>
                <label className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title={t("Show on the product page in the store", "Mostrar en la página del producto en la tienda")}><input type="checkbox" checked={!!v.customer_visible} onChange={(e) => toggleVisible(v, e.target.checked)} data-testid={`vm-store-${v.id}`} /> Store</label>
                <button onClick={() => del(v.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            {adding ? (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div>
                  <Label className="text-xs">{t("Video link", "Enlace del video")}</Label>
                  <Input data-testid="vm-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://youtu.be/..." className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Título (ES)" data-testid="vm-title-es" value={form.title_es} onChange={(e) => setForm({ ...form, title_es: e.target.value })} />
                  <Input placeholder="Title (EN)" value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={!!form.customer_visible} onChange={(e) => setForm({ ...form, customer_visible: e.target.checked })} data-testid="vm-store" /> {t("Show to customers (retail/wholesale) on this product", "Mostrar a clientes (retail/wholesale) en este producto")}</label>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setAdding(false)}>{t("Cancel", "Cancelar")}</Button>
                  <Button size="sm" className="bg-[#2495D3] hover:bg-[#1E7AA9]" onClick={save} data-testid="vm-save">{t("Save", "Guardar")}</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="vm-add"><Plus size={14} className="mr-1" /> {t("Add video", "Agregar video")}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
