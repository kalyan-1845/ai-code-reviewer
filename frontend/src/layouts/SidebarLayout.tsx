import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sparkles, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react';

export default function SidebarLayout() {
  const location = useLocation();

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
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px',
              textDecoration: 'none', fontSize: '13px', fontWeight: 600,
              background: location.pathname === '/dashboard' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: location.pathname === '/dashboard' ? '#60a5fa' : '#9ca3af',
              border: location.pathname === '/dashboard' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'
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
      </aside>

      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}