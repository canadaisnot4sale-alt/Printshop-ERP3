// In-memory per-module calculator state cache.
// Survives client-side navigation between modules; cleared on a full page reload (browser refresh),
// so the user's quote stays while hopping modules but resets on F5 — as requested.
const _cache = {};
export const getCalcCache = (key) => (key ? _cache[key] : undefined);
export const setCalcCache = (key, val) => { if (key) _cache[key] = val; };
export const clearCalcCache = (key) => { if (key) delete _cache[key]; };
