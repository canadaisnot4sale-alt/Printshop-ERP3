import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const MAX_ATTEMPTS = 6;

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const cancelled = loc.pathname.includes("cancel");
  const sessionId = params.get("session_id");
  const [state, setState] = useState(cancelled ? "cancelled" : "polling");
  const attempts = useRef(0);

  useEffect(() => {
    if (cancelled || !sessionId) { if (!cancelled) setState("error"); return; }
    let timer;
    const poll = async () => {
      if (attempts.current >= MAX_ATTEMPTS) { setState("timeout"); return; }
      attempts.current += 1;
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") { setState("paid"); return; }
        if (data.status === "expired") { setState("expired"); return; }
      } catch (e) { /* keep polling */ }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId, cancelled]);

  const cfg = {
    polling: { icon: <Loader2 size={48} className="text-[#2495D3] animate-spin" />, title: "Confirming your payment…", sub: "Please wait, this only takes a moment." },
    paid: { icon: <CheckCircle2 size={48} className="text-emerald-500" />, title: "Payment successful!", sub: "Your order is now marked as paid. Thank you." },
    cancelled: { icon: <XCircle size={48} className="text-slate-400" />, title: "Payment cancelled", sub: "No charge was made. You can try again anytime." },
    timeout: { icon: <Loader2 size={48} className="text-amber-500" />, title: "Still processing", sub: "We couldn't confirm the payment yet. Check your orders in a moment." },
    expired: { icon: <XCircle size={48} className="text-red-500" />, title: "Session expired", sub: "The checkout session expired. Please try paying again." },
    error: { icon: <XCircle size={48} className="text-red-500" />, title: "Something went wrong", sub: "We couldn't process the payment session." },
  }[state] || {};

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-8" data-testid="payment-return-page">
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md w-full shadow-sm" data-testid={`payment-${state}`}>
        <div className="flex justify-center mb-5">{cfg.icon}</div>
        <h2 className="font-head font-bold text-2xl mb-2">{cfg.title}</h2>
        <p className="text-slate-500 text-sm mb-8">{cfg.sub}</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => nav("/orders")} className="bg-[#2495D3] hover:bg-[#1E7AA9] rounded-lg" data-testid="payment-view-orders">View orders</Button>
          <Button variant="outline" onClick={() => nav("/store")} className="rounded-lg" data-testid="payment-back-store">Back to store</Button>
        </div>
      </div>
    </div>
  );
}
