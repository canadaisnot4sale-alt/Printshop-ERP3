import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Reads navigation state.requote (set by QuoteDetailDialog "Re-quote"), applies the saved
// inputs to the module's state via applyAll, then runs calc() once with the applied values.
export function useRequote(applyAll, calc) {
  const location = useLocation();
  const started = useRef(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const rq = location.state?.requote;
    if (rq && Object.keys(rq).length && !started.current) {
      started.current = true;
      applyAll(rq);
      setApplied(true);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (applied) { setApplied(false); calc(); }
    // eslint-disable-next-line
  }, [applied]);
}
