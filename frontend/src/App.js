import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import PaperPrinting from "@/pages/PaperPrinting";
import Booklet from "@/pages/Booklet";
import LargeFormat from "@/pages/LargeFormat";
import Stickers from "@/pages/Stickers";
import Equipment from "@/pages/Equipment";
import Settings from "@/pages/Settings";
import DTF from "@/pages/DTF";
import Embroidery from "@/pages/Embroidery";
import Laser from "@/pages/Laser";
import DirectPrint from "@/pages/DirectPrint";
import ChannelLetters from "@/pages/ChannelLetters";
import Sublimation from "@/pages/Sublimation";
import RollStickers from "@/pages/RollStickers";
import Catalog from "@/pages/Catalog";
import Users from "@/pages/Users";
import Quotes from "@/pages/Quotes";
import Machinery from "@/pages/Machinery";
import FixedCosts from "@/pages/FixedCosts";
import Financials from "@/pages/Financials";
import ProfitDashboard from "@/pages/ProfitDashboard";
import InkEstimator from "@/pages/InkEstimator";
import Materials from "@/pages/Materials";
import ReorderCenter from "@/pages/ReorderCenter";
import Purchases from "@/pages/Purchases";
import QuoteBuilder from "@/pages/QuoteBuilder";
import ProductsCatalog from "@/pages/ProductsCatalog";
import Storefront from "@/pages/Storefront";
import Orders from "@/pages/Orders";
import PaymentReturn from "@/pages/PaymentReturn";

function Protected({ children, adminOnly }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/paper" element={<Protected><PaperPrinting /></Protected>} />
            <Route path="/booklet" element={<Protected><Booklet /></Protected>} />
            <Route path="/large-format" element={<Protected><LargeFormat /></Protected>} />
            <Route path="/stickers" element={<Protected><Stickers /></Protected>} />
            <Route path="/dtf" element={<Protected><DTF /></Protected>} />
            <Route path="/embroidery" element={<Protected><Embroidery /></Protected>} />
            <Route path="/laser" element={<Protected><Laser /></Protected>} />
            <Route path="/direct-print" element={<Protected><DirectPrint /></Protected>} />
            <Route path="/channel-letters" element={<Protected><ChannelLetters /></Protected>} />
            <Route path="/sublimation" element={<Protected><Sublimation /></Protected>} />
            <Route path="/roll-stickers" element={<Protected><RollStickers /></Protected>} />
            <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
            <Route path="/quotes" element={<Protected><Quotes /></Protected>} />
            <Route path="/quote-builder" element={<Protected><QuoteBuilder /></Protected>} />
            <Route path="/products-catalog" element={<Protected adminOnly><ProductsCatalog /></Protected>} />
            <Route path="/store" element={<Protected><Storefront /></Protected>} />
            <Route path="/orders" element={<Protected><Orders /></Protected>} />
            <Route path="/payment/success" element={<Protected><PaymentReturn /></Protected>} />
            <Route path="/payment/cancel" element={<Protected><PaymentReturn /></Protected>} />
            <Route path="/equipment" element={<Protected adminOnly><Equipment /></Protected>} />
            <Route path="/machinery" element={<Protected adminOnly><Machinery /></Protected>} />
            <Route path="/fixed-costs" element={<Protected adminOnly><FixedCosts /></Protected>} />
            <Route path="/financials" element={<Protected adminOnly><Financials /></Protected>} />
            <Route path="/profit-dashboard" element={<Protected adminOnly><ProfitDashboard /></Protected>} />
            <Route path="/ink-estimator" element={<Protected adminOnly><InkEstimator /></Protected>} />
            <Route path="/materials" element={<Protected adminOnly><Materials /></Protected>} />
            <Route path="/reorder" element={<Protected adminOnly><ReorderCenter /></Protected>} />
            <Route path="/purchases" element={<Protected adminOnly><Purchases /></Protected>} />
            <Route path="/users" element={<Protected adminOnly><Users /></Protected>} />
            <Route path="/settings" element={<Protected adminOnly><Settings /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </CartProvider>
        <Toaster position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
