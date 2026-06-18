import { AlertTriangle, Bug, ShieldAlert, Zap } from 'lucide-react';

interface ReviewItem {
  type: string;
  line: number;
  description: string;
  suggestion: string;
}

interface FileReview {
  bugs?: ReviewItem[];
  security?: ReviewItem[];
  optimization?: ReviewItem[];
  styling?: ReviewItem[];
}

interface Props {
  fileReviews: Record<string, FileReview>;
  isLoading?: boolean;
}

export default function TotalIssuesKpiCard({ fileReviews, isLoading = false }: Props) {
  const counts = Object.values(fileReviews || {}).reduce(
    (acc, review) => ({
      bugs: acc.bugs + (review.bugs?.length || 0),
      security: acc.security + (review.security?.length || 0),
      optimization: acc.optimization + (review.optimization?.length || 0),
      styling: acc.styling + (review.styling?.length || 0),
    }),
    { bugs: 0, security: 0, optimization: 0, styling: 0 },
  );

  const total = counts.bugs + counts.security + counts.optimization + counts.styling;

  const severity = total === 0 ? 'none' : total <= 5 ? 'low' : total <= 15 ? 'medium' : 'high';

  const colorMap = {
    none: { text: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.28)', label: 'Clean' },
    low: { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.28)', label: 'Low' },
    medium: { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.28)', label: 'Moderate' },
    high: { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.28)', label: 'Critical' },
  };

  const colors = colorMap[severity];

  return (
    <div
      className="glass-panel"
      style={{
        padding: '18px 20px',
        borderRadius: '12px',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.14)', border: '1px solid rgba(59, 130, 246, 0.28)', color: '#60a5fa', padding: '3px 8px', borderRadius: '999px', fontWeight: 700, textTransform: 'uppercase' }}>
            KPI Metric
          </span>
          <h2 style={{ fontSize: '16px', color: 'var(--title-color, #f3f4f6)', margin: '8px 0 4px 0', fontWeight: 800 }}>
            Total Issues Found
          </h2>
          <p style={{ margin: 0, color: 'var(--subtext-color, #9ca3af)', fontSize: '12px', lineHeight: 1.5 }}>
            Aggregated findings across all categories
          </p>
        </div>
        <div style={{ alignSelf: 'center', background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
          {isLoading ? '...' : colors.label}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
        <div style={{ textAlign: 'center', minWidth: '80px' }}>
          <div style={{ fontSize: '36px', fontWeight: 850, color: colors.text, lineHeight: 1 }}>
            {isLoading ? '...' : total}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600, textTransform: 'uppercase', marginTop: '4px' }}>
            Total Issues
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'Bugs', count: counts.bugs, icon: Bug, color: '#ef4444' },
            { label: 'Security', count: counts.security, icon: ShieldAlert, color: '#f59e0b' },
            { label: 'Perf', count: counts.optimization, icon: Zap, color: '#3b82f6' },
            { label: 'Style', count: counts.styling, icon: AlertTriangle, color: '#10b981' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={{ background: `${item.color}10`, border: `1px solid ${item.color}25`, borderRadius: '8px', padding: '10px 8px', textAlign: 'center', minWidth: 0 }}>
                <Icon size={16} style={{ color: item.color, marginBottom: '4px' }} />
                <div style={{ fontSize: '18px', fontWeight: 800, color: item.color, lineHeight: 1.2 }}>
                  {isLoading ? '...' : item.count}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
