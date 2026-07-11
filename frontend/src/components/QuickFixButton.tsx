import { useState, useEffect, useRef } from 'react';
import { Check, Lightbulb, Zap } from 'lucide-react';

export function QuickFixButton({ text, onApply }: { text: string; onApply: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApply = () => {
    onApply(text);
    setApplied(true);
    setOpen(false);
    setTimeout(() => setApplied(false), 2000);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button aria-label="Quick fix"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          border: 'none',
          borderRadius: '6px',
          padding: '4px 8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease-in-out',
          background: open ? 'rgba(234,179,8,0.15)' : applied ? 'transparent' : 'transparent',
          color: open ? 'rgb(234,179,8)' : applied ? 'rgb(34,197,94)' : 'rgb(156,163,175)',
        }}
        title="Quick Fix"
      >
        {applied ? <Check size={14} /> : <Lightbulb size={14} />}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: '160px',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          <button aria-label="Quick fix"
            type="button"
            onClick={handleApply}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              color: '#f3f4f6',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Zap size={14} color="rgb(234,179,8)" />
            <span>Apply AI Fix</span>
          </button>
        </div>
      )}
    </div>
  );
}
