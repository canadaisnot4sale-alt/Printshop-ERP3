import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
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

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/paper" element={<Protected><PaperPrinting /></Protected>} />
            <Route path="/booklet" element={<Protected><Booklet /></Protected>} />
            <Route path="/large-format" element={<Protected><LargeFormat /></Protected>} />
            <Route path="/stickers" element={<Protected><Stickers /></Protected>} />
            <Route path="/equipment" element={<Protected><Equipment /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
