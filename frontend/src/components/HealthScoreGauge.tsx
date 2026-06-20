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
  theme?: 'dark' | 'light';
}

function computeHealthScore(fileReviews: Record<string, FileReview>): number {
  let totalBugs = 0, totalSecurityIssues = 0, totalOptimizations = 0, totalStylingIssues = 0;
  for (const review of Object.values(fileReviews || {})) {
    totalBugs += review.bugs?.length || 0;
    totalSecurityIssues += review.security?.length || 0;
    totalOptimizations += review.optimization?.length || 0;
    totalStylingIssues += review.styling?.length || 0;
  }
  return Math.max(0, Math.round(100 - totalBugs * 5 - totalSecurityIssues * 3 - totalOptimizations * 1 - totalStylingIssues * 0.5));
}

function getScoreColor(score: number): { text: string; bg: string; border: string; label: string } {
  if (score >= 80) return { text: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.28)', label: 'Excellent' };
  if (score >= 60) return { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.28)', label: 'Good' };
  if (score >= 40) return { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.28)', label: 'Fair' };
  return { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.28)', label: 'Needs Work' };
}

function GaugeSvg({ score, size = 140, theme = 'dark' }: { score: number; size?: number; theme?: 'dark' | 'light' }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const gradientId = `health-gauge-${Math.random().toString(36).slice(2, 8)}`;
  const trackStroke = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackStroke}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
      />
      <text
        x={center}
        y={center - 6}
        textAnchor="middle"
        fill="var(--text-color, #f3f4f6)"
        fontSize="28"
        fontWeight="800"
        fontFamily="inherit"
      >
        {score}
      </text>
      <text
        x={center}
        y={center + 16}
        textAnchor="middle"
        fill="var(--subtext-color, #9ca3af)"
        fontSize="10"
        fontWeight="600"
        fontFamily="inherit"
      >
        / 100
      </text>
    </svg>
  );
}

export default function HealthScoreGauge({ fileReviews, isLoading = false, theme = 'dark' }: Props) {
  const score = computeHealthScore(fileReviews);
  const colors = getScoreColor(score);

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
            Dynamic Gauge
          </span>
          <h2 style={{ fontSize: '16px', color: 'var(--title-color, #f3f4f6)', margin: '8px 0 4px 0', fontWeight: 800 }}>
            Repository Health Score
          </h2>
          <p style={{ margin: 0, color: 'var(--subtext-color, #9ca3af)', fontSize: '12px', lineHeight: 1.5 }}>
            Overall code quality score from 0–100
          </p>
        </div>
        <div style={{ alignSelf: 'center', background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
          {isLoading ? '...' : colors.label}
        </div>
      </div>

      <div className="gauge-layout">
        <div style={{ flexShrink: 0 }}>
          {isLoading ? (
            <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: 'var(--chart-track, rgba(255,255,255,0.03))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--subtext-color, #9ca3af)', fontSize: '12px' }}>...</span>
            </div>
          ) : (
            <GaugeSvg score={score} theme={theme} />
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { range: '80–100', label: 'Excellent', color: '#22c55e' },
            { range: '60–79', label: 'Good', color: '#3b82f6' },
            { range: '40–59', label: 'Fair', color: '#f59e0b' },
            { range: '0–39', label: 'Needs Work', color: '#ef4444' },
          ].map((tier) => (
            <div key={tier.range} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: tier.color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--text-color, #f3f4f6)', fontWeight: 600, minWidth: '50px' }}>{tier.range}</span>
              <span style={{ fontSize: '11px', color: 'var(--subtext-color, #9ca3af)' }}>{tier.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
