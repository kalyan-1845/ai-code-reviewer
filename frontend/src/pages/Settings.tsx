import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Save, Cpu, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const ALLOWED_MODELS = [
  { id: 'llama3-70b-8192', name: 'Llama 3.3 70B (Versatile)', description: 'Fast and versatile, great for general code review.' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 (Llama Distill)', description: 'Optimized for complex reasoning and deep codebase analysis.' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Instant)', description: 'Lightweight model for extremely fast responses.' },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', description: 'Google\'s Gemma architecture, excellent for concise suggestions.' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Reliable and fast general-purpose model.' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', description: 'Advanced multi-modal capable code reasoning.' }
];

export default function Settings() {
  const [model, setModel] = useState('llama3-70b-8192');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/user/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.preferredModel) {
          setModel(data.preferredModel);
        }
      } else {
        throw new Error('Failed to load settings');
      }
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await apiFetch('/api/user/settings', {
        method: 'POST',
        body: JSON.stringify({ preferredModel: model })
      });
      
      if (res.ok) {
        setSuccess('Settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px', color: 'var(--subtext-color)' }}>
        <Loader2 size={40} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--highlight-color)' }} />
        <span style={{ marginTop: '16px', fontSize: '14px', fontWeight: 500 }}>Loading Settings...</span>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--title-color)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Cpu size={28} style={{ color: 'var(--highlight-color)' }} />
          AI Preferences
        </h1>
        <p style={{ color: 'var(--subtext-color)', margin: 0, fontSize: '15px' }}>
          Customize how RepoSage analyzes your code by selecting your preferred underlying AI model.
        </p>
      </div>

      <div style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(10px)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--title-color)', margin: '0 0 16px 0' }}>Select Analysis Model</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {ALLOWED_MODELS.map((m) => (
            <div 
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: model === m.id ? '2px solid var(--highlight-color)' : '1px solid var(--border-color)',
                background: model === m.id ? 'rgba(168, 85, 247, 0.05)' : 'rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: model === m.id ? 'translateY(-2px)' : 'none',
                boxShadow: model === m.id ? '0 4px 12px rgba(168, 85, 247, 0.15)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (model !== m.id) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (model !== m.id) {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: model === m.id ? 'var(--highlight-color)' : 'var(--title-color)' }}>
                  {m.name}
                </h4>
                {model === m.id && <CheckCircle size={18} style={{ color: 'var(--highlight-color)' }} />}
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--subtext-color)', lineHeight: 1.5 }}>
                {m.description}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', color: '#22c55e', marginBottom: '16px', fontSize: '14px' }}>
            <CheckCircle size={18} />
            {success}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
