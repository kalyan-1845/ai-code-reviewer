import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sparkles, LayoutDashboard, Settings as SettingsIcon, Sun, Moon } from 'lucide-react';

export default function SidebarLayout() {
  const location = useLocation();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const savedTheme = localStorage.getItem("reposage_theme");
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("reposage_theme", theme);
  }, [theme]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-color)' }}>
      {/* Sidebar Navigation */}
      <aside style={{ 
        width: '260px', 
        background: 'var(--panel-bg)', 
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', padding: '8px', borderRadius: '8px' }}>
            <Sparkles size={20} style={{ color: 'white' }} />
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--title-color)' }}>RepoSage</h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link 
            to="/dashboard" 
            aria-current={location.pathname === '/dashboard' ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px',
              textDecoration: 'none', fontSize: '13px', fontWeight: 600,
              background: location.pathname === '/dashboard' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: location.pathname === '/dashboard' ? '#60a5fa' : '#9ca3af',
              border: location.pathname === '/dashboard' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
            }}
          >
            <LayoutDashboard size={16} /> Analytics Dashboard
          </Link>
          
          <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'not-allowed'
            }}
          >
            <SettingsIcon size={16} /> Settings (WIP)
          </div>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button aria-label="Sidebar toggle"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px',
              width: '100%', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: '#9ca3af',
              background: 'rgba(255,255,255,0.03)',
            }}
            aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </aside>

      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}