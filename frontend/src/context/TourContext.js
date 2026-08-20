import { createContext, useContext, useCallback } from "react";
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

  const startTour = useCallback((tourId) => {
    const tour = TOURS.find((t) => t.id === tourId);
    if (!tour) return;
    const en = (localStorage.getItem("pns_train_lang") || "es") === "en";
    setTourMode(true);
    nav(tour.route);
    setTimeout(() => {
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
        onDestroyed: () => setTourMode(false),
      });
      d.drive();
    }, 800);
  }, [nav, setTourMode]);

  return <TourContext.Provider value={{ startTour }}>{children}</TourContext.Provider>;
}
