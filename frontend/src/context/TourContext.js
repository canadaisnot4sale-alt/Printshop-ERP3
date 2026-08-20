import { createContext, useContext, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/context/AuthContext";
import { TOURS } from "@/lib/tours";

const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }) {
  const nav = useNavigate();
  const { setTourMode } = useAuth();
  const switchingRef = useRef(false);

  const build = useCallback((tour, en, startIndex) => {
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: "rgba(15, 23, 42, 0.6)",
      nextBtnText: en ? "Next →" : "Siguiente →",
      prevBtnText: en ? "← Back" : "← Atrás",
      doneBtnText: en ? "Finish" : "Finalizar",
      progressText: "{{current}} / {{total}}",
      steps: tour.steps.map((s) => ({
        element: s.target,
        popover: {
          title: en ? s.title_en : s.title_es,
          description: en ? s.body_en : s.body_es,
        },
      })),
      onPopoverRender: (popover) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = en ? "ES" : "EN";
        btn.setAttribute("data-testid", "tour-lang-toggle");
        btn.title = en ? "Cambiar a español" : "Switch to English";
        btn.style.cssText =
          "margin-right:auto;font-size:11px;font-weight:800;border:1px solid #cbd5e1;border-radius:6px;padding:3px 9px;cursor:pointer;background:#fff;color:#2495D3;";
        btn.addEventListener("click", () => {
          const idx = d.getActiveIndex() ?? 0;
          const newEn = !en;
          localStorage.setItem("pns_train_lang", newEn ? "en" : "es");
          switchingRef.current = true;
          d.destroy();
          switchingRef.current = false;
          build(tour, newEn, idx);
        });
        popover.footerButtons.prepend(btn);
      },
      onDestroyed: () => { if (!switchingRef.current) setTourMode(false); },
    });
    d.drive(startIndex || 0);
  }, [setTourMode]);

  const startTour = useCallback((tourId) => {
    const tour = TOURS.find((t) => t.id === tourId);
    if (!tour) return;
    const en = (localStorage.getItem("pns_train_lang") || "es") === "en";
    setTourMode(true);
    nav(tour.route);
    setTimeout(() => build(tour, en, 0), 800);
  }, [nav, setTourMode, build]);

  return <TourContext.Provider value={{ startTour }}>{children}</TourContext.Provider>;
}
