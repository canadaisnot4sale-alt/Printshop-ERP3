import { useState } from "react";
import api, { apiErr, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Upload, Loader2, RotateCw } from "lucide-react";

// Downscale an image file to <=1024px and return base64 (no data-url prefix)
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        let { width, height } = img;
        if (width > height && width > max) { height = Math.round((height * max) / width); width = max; }
        else if (height > max) { width = Math.round((width * max) / height); height = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const authImg = (u) => (u ? (u.startsWith("http") ? u : `${API}${u}?auth=${localStorage.getItem("pns_token")}`) : null);

export default function ProductImageAI({ name, description, value, onGenerated, onFrames, spinFrames = [] }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [ref, setRef] = useState(null);

  const payload = (reference_image_base64) => ({ prompt, name: name || "", description: description || "", reference_image_base64 });

  const run = async (reference_image_base64) => {
    setLoading(true);
    try {
      const { data } = await api.post("/marketing/product-image", payload(reference_image_base64));
      onGenerated(data.url);
      toast.success("Image generated");
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setLoading(false); }
  };

  const gen360 = async () => {
    if (!onFrames) return;
    setSpinning(true);
    try {
      const { data } = await api.post("/marketing/product-360", payload(ref));
      onFrames(data.frames || []);
      toast.success(`360° spin generated (${(data.frames || []).length} frames)`);
    } catch (e) { toast.error(apiErr(e.response?.data?.detail) || e.message); }
    finally { setSpinning(false); }
  };

  const onEnhance = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setLoading(true);
    try { const b64 = await fileToBase64(file); setRef(b64); await run(b64); }
    catch (err) { setLoading(false); toast.error("Could not read image"); }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-2 mt-1 space-y-2" data-testid="product-image-ai">
      {value && <img src={authImg(value)} alt="preview" className="h-16 w-16 rounded object-cover border border-slate-200" />}
      <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional prompt (else uses the description)" className="rounded-lg h-8 text-xs" data-testid="pai-prompt" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={() => run(null)} className="bg-[#2495D3] hover:bg-[#1E7AA9] h-8" data-testid="pai-generate">
          {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />} Generate with AI
        </Button>
        <label className={`inline-flex items-center gap-1 text-xs px-3 h-8 rounded-md border border-slate-300 cursor-pointer hover:bg-slate-50 ${loading ? "opacity-50 pointer-events-none" : ""}`} data-testid="pai-enhance-label">
          <Upload size={14} /> Enhance my photo
          <input type="file" accept="image/*" className="hidden" onChange={onEnhance} data-testid="pai-enhance" />
        </label>
        {onFrames && (
          <Button type="button" size="sm" variant="outline" disabled={spinning} onClick={gen360} className="h-8" data-testid="pai-360">
            {spinning ? <Loader2 size={14} className="animate-spin mr-1" /> : <RotateCw size={14} className="mr-1" />} 360° spin
          </Button>
        )}
      </div>
      {spinFrames.length > 0 && <div className="text-[11px] text-emerald-600">✓ 360° spin ready ({spinFrames.length} frames) — customers can rotate it in the store.</div>}
    </div>
  );
}
