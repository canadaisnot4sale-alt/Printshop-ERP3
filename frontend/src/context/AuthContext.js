import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [ready, setReady] = useState(false);
  const [tourMode, setTourMode] = useState(false);
  const [viewAs, setViewAsState] = useState(() => localStorage.getItem("pns_view_as") || "admin");

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const hash = window.location.hash || "";
    if (hash.includes("session_id=")) {
      const sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
      api.post("/auth/google/session", { session_id: sid })
        .then((r) => { localStorage.setItem("pns_token", r.data.token); setUser(r.data.user); })
        .catch(() => setUser(false))
        .finally(() => { window.history.replaceState(null, "", window.location.pathname); setReady(true); });
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false))
      .finally(() => setReady(true));
  }, []);

  const login = (data) => {
    localStorage.setItem("pns_token", data.token);
    setUser(data.user);
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    localStorage.removeItem("pns_token");
    localStorage.removeItem("pns_view_as");
    setTourMode(false);
    setUser(false);
  };

  const realRole = (user && typeof user === "object") ? user.role : null;
  const setViewAs = (v) => {
    if (v === "admin") localStorage.removeItem("pns_view_as");
    else localStorage.setItem("pns_view_as", v);
    setViewAsState(v === "admin" ? "admin" : v);
    window.location.reload(); // refetch all data with the X-View-As header
  };

  // Effective user for UI gating: an admin can preview the whole app exactly as a client/reseller
  // (a true mirror). The real role is kept separately so the View-as switch stays available.
  const effUser = (user && typeof user === "object" && realRole === "admin" && (viewAs === "client" || viewAs === "reseller"))
    ? { ...user, role: viewAs }
    : user;

  return (
    <AuthContext.Provider value={{ user: effUser, realRole, viewAs, setViewAs, ready, login, logout, tourMode, setTourMode }}>
      {children}
    </AuthContext.Provider>
  );
}
