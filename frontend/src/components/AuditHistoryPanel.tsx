
import { Clock, Trash2 } from "lucide-react";
import { AuditHistoryEntry } from "../pages/Dashboard";

interface AuditHistoryPanelProps {
  auditHistory: AuditHistoryEntry[];
  clearAuditHistory: () => void;
  loadAuditFromHistory: (entry: AuditHistoryEntry) => void;
}

export default function AuditHistoryPanel({
  auditHistory, clearAuditHistory, loadAuditFromHistory,
}: AuditHistoryPanelProps) {
  return (
    <div className="glass-panel" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: '#60a5fa' }} /> Recent Audits
          </h2>
          <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>Reload cached repository scans</p>
        </div>
        {auditHistory.length > 0 && (
          <button aria-label="Clear audit history"
            onClick={clearAuditHistory}
            title="Clear audit history"
            style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {auditHistory.length === 0 ? (
        <div style={{ padding: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', color: '#9ca3af', fontSize: '11px', lineHeight: 1.5 }}>
          Completed scans will appear here after a successful analysis.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {auditHistory.slice(0, 5).map(entry => (
            <button
              key={entry.id}
              onClick={() => loadAuditFromHistory(entry)}
              style={{ width: '100%', textAlign: 'left', padding: '10px', borderRadius: '6px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)', color: '#e5e7eb', cursor: 'pointer' }}
            >
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.repoName}</span>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px', fontSize: '10px', color: '#9ca3af' }}>
                <span>{new Date(entry.auditedAt).toLocaleDateString()}</span>
                <span>{entry.totalFindings} findings · Grade {entry.overallGrade}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
