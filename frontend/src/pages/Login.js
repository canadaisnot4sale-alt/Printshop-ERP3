import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name: name || "User" };
      const { data } = await api.post(path, body);
      login(data);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      nav("/");
    } catch (err) {
      toast.error(apiErr(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="Print and Save" className="w-16 h-16 object-contain mx-auto mb-3" />
          <div className="font-head font-black text-3xl tracking-tight">
            Print <span className="text-[#2495D3]">and</span> Save
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tracking-widest uppercase">
            Your Brand in Focus
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-sm p-8">
          <h1 className="font-head font-bold text-xl mb-1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-slate-500 mb-6">{mode === "login" ? "Sign in to see prices and order." : "Create your account to see prices and order online."}</p>
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label className="text-xs">Name</Label>
                <Input data-testid="name-input" value={name} onChange={(e) => setName(e.target.value)} className="rounded-sm mt-1" />
              </div>
            )}
            <div>
              <Label className="text-xs">Email</Label>
              <Input data-testid="email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <Input data-testid="password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-sm mt-1" />
            </div>
            <Button data-testid="submit-auth-button" disabled={loading} className="w-full bg-[#2495D3] hover:bg-[#1E7AA9] rounded-sm">
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
            </Button>
          </form>
          <button
            type="button"
            data-testid="google-login-button"
            onClick={() => {
              // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
              window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin)}`;
            }}
            className="w-full mt-3 border border-slate-300 rounded-sm py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-4 h-4" />
            Continue with Google
          </button>
          <button
            data-testid="toggle-auth-mode"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-sm text-[#2495D3] mt-4 hover:underline"
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
