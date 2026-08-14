import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";

// Defaults a module's sheet-size selector to the SIZE of that module's default material.
// endpoint: a per-module material read view (e.g. "/paper-stocks?module=paper").
// setSize: state setter that receives a "WxH" string (e.g. "12x18").
// Skips when arriving via Re-quote so saved inputs win.
export function useDefaultSheetSize(endpoint, setSize) {
  const location = useLocation();
  useEffect(() => {
    if (location.state?.requote) return;
    api.get(endpoint).then((r) => {
      const list = r.data || [];
      const def = list.find((m) => m.is_default) || list[0];
      const mt = String(def?.size || "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
      if (mt) setSize(`${mt[1]}x${mt[2]}`);
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);
}
