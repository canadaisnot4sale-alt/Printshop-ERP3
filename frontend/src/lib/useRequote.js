import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCalcCache, setCalcCache } from "./calcCache";

// Applies saved inputs to a module's calculator then runs calc() once. The inputs come from either:
//  1) navigation state.requote (QuoteDetailDialog "Re-quote") — takes priority, or
//  2) the in-memory per-module cache (opts.moduleKey) — restores the last quote when returning to the
//     module. The cache lives only in memory: it survives switching modules but resets on a browser refresh.
// When opts.moduleKey/inputs/hasResult are provided, the current inputs are persisted to the cache
// whenever they change (while a result exists), so the quote is there when the user comes back.
export function useRequote(applyAll, calc, opts = {}) {
  const { moduleKey, inputs, hasResult } = opts;
  const location = useLocation();
  const started = useRef(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const rq = location.state?.requote;
    const restore = (rq && Object.keys(rq).length) ? rq : (moduleKey ? getCalcCache(moduleKey) : null);
    if (restore && Object.keys(restore).length) {
      applyAll(restore);
      setApplied(true);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (applied) { setApplied(false); calc(); }
    // eslint-disable-next-line
  }, [applied]);

  useEffect(() => {
    if (moduleKey && hasResult && inputs) setCalcCache(moduleKey, inputs);
    // eslint-disable-next-line
  }, [moduleKey, hasResult, JSON.stringify(inputs || {})]);
}
