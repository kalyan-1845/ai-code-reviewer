import { useState, useEffect, useRef } from 'react';
import { Check, Lightbulb, Zap } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';
import Dashboard from './pages/Dashboard';

export function QuickFixButton({ text, onApply }: { text: string; onApply: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleApply = () => {
    onApply(text);
    setApplied(true);
    setOpen(false);
    timeoutRef.current = setTimeout(() => setApplied(false), 2000);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: open ? "rgba(234,179,8,0.15)" : "transparent",
          border: "none",
          borderRadius: "4px",
          padding: "4px 8px",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: applied ? "#22c55e" : open ? "#eab308" : "#9ca3af",
          transition: "all 0.2s ease",
        }}
        title="Quick Fix"
      >
        {applied ? <Check size={14} /> : <Lightbulb size={14} />}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            background: "#1e293b",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            minWidth: "160px",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={handleApply}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              color: "#f3f4f6",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Zap size={14} style={{ color: "#eab308" }} />
            <span>Apply AI Fix</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Wrap all routes inside the SidebarLayout */}
                <Route element={<SidebarLayout />}>

                    {/* Default route redirects to /dashboard */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* The new Analytics Dashboard Route */}
                    <Route path="/dashboard" element={<Dashboard />} />

                </Route>
            </Routes>
        </BrowserRouter>
    );
}
// resolving conflicts