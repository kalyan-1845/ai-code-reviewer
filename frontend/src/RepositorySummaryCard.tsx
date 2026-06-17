import {
  Activity,
  AlertTriangle,
  Code2,
  FileCode,
  Languages,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

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

interface FileMetrics {
  totalLines?: number;
  emptyLines?: number;
  commentLines?: number;
  codeLines?: number;
  functionCount?: number;
  complexityScore?: number;
  grade?: string;
}

interface RepositoryAnalysisResult {
  repoName?: string;
  filesReviewedCount?: number;
  analysis?: {
    fileReviews?: Record<string, FileReview>;
    metrics?: Record<string, FileMetrics>;
  };
}

interface Props {
  result: RepositoryAnalysisResult | null;
  isLoading?: boolean;
}

const gradeRank: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  F: 5,
};

const gradeColors: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.28)' },
  B: { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.28)' },
  C: { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.28)' },
  D: { text: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.28)' },
  F: { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.28)' },
};

function getAggregateGrade(metrics: Record<string, FileMetrics>) {
  const grades = Object.values(metrics)
    .map((metric) => metric.grade?.toUpperCase())
    .filter((grade): grade is string => Boolean(grade && gradeRank[grade]));

  if (grades.length === 0) {
    return null;
  }

  return grades.reduce((worst, grade) => (
    gradeRank[grade] > gradeRank[worst] ? grade : worst
  ), 'A');
}

function getHealthStatus(totalFindings: number, securityIssues: number, grade: string | null) {
  const rank = grade ? gradeRank[grade] || 1 : 1;

  if (securityIssues > 0 || totalFindings > 15 || rank >= gradeRank.D) {
    return {
      label: 'Needs Attention',
      color: '#ef4444',
      background: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.28)',
    };
  }

  if (totalFindings > 5 || rank === gradeRank.C) {
    return {
      label: 'Moderate',
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.28)',
    };
  }

  return {
    label: 'Good',
    color: '#22c55e',
    background: 'rgba(34, 197, 94, 0.1)',
    border: 'rgba(34, 197, 94, 0.28)',
  };
}

function formatLanguages(fileReviews: Record<string, FileReview>) {
  const counts = Object.keys(fileReviews).reduce<Record<string, number>>((acc, filePath) => {
    const extension = filePath.split('.').pop()?.toLowerCase() || 'other';
    acc[extension] = (acc[extension] || 0) + 1;
    return acc;
  }, {});

  const languages = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const preview = languages.slice(0, 3).map(([extension]) => extension.toUpperCase()).join(', ');

  return {
    count: languages.length,
    preview: preview || 'Unavailable',
  };
}

export default function RepositorySummaryCard({ result, isLoading = false }: Props) {
  const fileReviews = result?.analysis?.fileReviews ?? {};
  const metrics = result?.analysis?.metrics ?? {};
  const filesAnalyzed = result?.filesReviewedCount ?? Object.keys(fileReviews).length;
  const languages = formatLanguages(fileReviews);
  const hasMetrics = Object.keys(metrics).length > 0;

  const findings = Object.values(fileReviews).reduce(
    (acc, review) => {
      const bugs = review.bugs?.length || 0;
      const security = review.security?.length || 0;
      const optimization = review.optimization?.length || 0;
      const styling = review.styling?.length || 0;

      return {
        total: acc.total + bugs + security + optimization + styling,
        security: acc.security + security,
      };
    },
    { total: 0, security: 0 },
  );

  const aggregateGrade = hasMetrics ? getAggregateGrade(metrics) : null;
  const health = hasMetrics
    ? getHealthStatus(findings.total, findings.security, aggregateGrade)
    : {
      label: 'Awaiting Metrics',
      color: '#64748b',
      background: 'rgba(100, 116, 139, 0.1)',
      border: 'rgba(100, 116, 139, 0.26)',
    };
  const gradeColor = aggregateGrade ? gradeColors[aggregateGrade] : null;

  const summaryItems = [
    {
      label: 'Files Analyzed',
      value: isLoading ? '...' : filesAnalyzed.toLocaleString(),
      detail: 'Source files reviewed',
      icon: FileCode,
      color: '#60a5fa',
    },
    {
      label: 'Languages',
      value: isLoading ? '...' : languages.count.toString(),
      detail: languages.preview,
      icon: Languages,
      color: '#22c55e',
    },
    {
      label: 'Security Issues',
      value: isLoading ? '...' : findings.security.toLocaleString(),
      detail: findings.security === 1 ? 'Finding requires review' : 'Findings require review',
      icon: ShieldAlert,
      color: findings.security > 0 ? '#ef4444' : '#22c55e',
    },
    {
      label: 'Complexity Grade',
      value: isLoading ? '...' : aggregateGrade || 'N/A',
      detail: hasMetrics ? 'Worst file grade' : 'Metrics unavailable',
      icon: Code2,
      color: gradeColor?.text || '#94a3b8',
    },
    {
      label: 'AI Findings',
      value: isLoading ? '...' : findings.total.toLocaleString(),
      detail: 'Bugs, security, perf, style',
      icon: Sparkles,
      color: '#a855f7',
    },
    {
      label: 'Repo Health',
      value: isLoading ? '...' : health.label,
      detail: hasMetrics ? 'Based on findings and complexity' : 'Waiting for analysis data',
      icon: Activity,
      color: health.color,
    },
  ];

  if (!result && !isLoading) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '18px 20px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'var(--subtext-color, #9ca3af)',
          fontSize: '12px',
        }}
      >
        <AlertTriangle size={16} />
        Repository summary will appear after analysis completes.
      </div>
    );
  }

  return (
    <section
      className="glass-panel"
      aria-label="Repository analysis summary"
      style={{
        padding: '18px 20px',
        borderRadius: '12px',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '14px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '10px',
              background: 'rgba(59, 130, 246, 0.14)',
              border: '1px solid rgba(59, 130, 246, 0.28)',
              color: '#60a5fa',
              padding: '3px 8px',
              borderRadius: '999px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Quick Insights
          </span>
          <h2
            style={{
              fontSize: '16px',
              color: 'var(--title-color, #f3f4f6)',
              margin: '8px 0 4px 0',
              fontWeight: 800,
            }}
          >
            Repository Analysis Summary
          </h2>
          <p
            style={{
              margin: 0,
              color: 'var(--subtext-color, #9ca3af)',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            {result?.repoName || 'Repository'} at a glance before the detailed report.
          </p>
        </div>

        <div
          style={{
            alignSelf: 'center',
            background: health.background,
            border: `1px solid ${health.border}`,
            color: health.color,
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {health.label}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '10px',
        }}
      >
        {summaryItems.map((item) => {
          const Icon = item.icon;
          const isHealth = item.label === 'Repo Health';
          const isGrade = item.label === 'Complexity Grade' && gradeColor;

          return (
            <div
              key={item.label}
              style={{
                background: isHealth ? health.background : isGrade ? gradeColor.bg : `${item.color}12`,
                border: `1px solid ${isHealth ? health.border : isGrade ? gradeColor.border : `${item.color}2e`}`,
                borderRadius: '8px',
                padding: '12px',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <span
                  style={{
                    color: 'var(--subtext-color, #9ca3af)',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </span>
                <Icon size={16} style={{ color: item.color, flexShrink: 0 }} />
              </div>

              <div
                style={{
                  color: item.color,
                  fontSize: item.label === 'Repo Health' ? '17px' : '22px',
                  fontWeight: 850,
                  lineHeight: 1.1,
                  overflowWrap: 'anywhere',
                }}
              >
                {item.value}
              </div>
              <div
                style={{
                  color: 'var(--subtext-color, #9ca3af)',
                  fontSize: '10px',
                  lineHeight: 1.4,
                  marginTop: '6px',
                }}
              >
                {item.detail}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
