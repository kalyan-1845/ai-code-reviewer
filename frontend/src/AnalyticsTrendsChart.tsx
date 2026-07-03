import React, { useEffect, useState } from 'react';

interface TrendPoint {
    date: string;
    analyses: number;
    totalFindings: number;
    avgHealthScore: number;
    totalBugs: number;
    totalSecurityIssues: number;
}

const API_BASE_URL = 'http://localhost:5000';

const SERIES = [
    { key: 'totalFindings', label: 'Findings', color: '#f97316' },
    { key: 'totalBugs', label: 'Bugs', color: '#ef4444' },
    { key: 'totalSecurityIssues', label: 'Security', color: '#3b82f6' },
] as const;

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING = 32;

const AnalyticsTrendsChart: React.FC = () => {
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchTrends = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/analytics/trends`);
                if (!res.ok) throw new Error('Failed to fetch trends');
                const data = await res.json();
                if (isMounted) {
                    setTrends(data.trends || []);
                    setError(null);
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message || 'Could not load trends.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchTrends();

        return () => {
            isMounted = false;
        };
    }, []);

    if (loading) {
        return (
            <div
                className="glass-panel"
                style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--subtext-color, #9ca3af)',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                }}
            >
                Loading analytics trends...
            </div>
        );
    }

    if (error) {
        return (
            <div
                className="glass-panel"
                style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#ef4444',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                }}
            >
                ⚠️ {error}
            </div>
        );
    }

    if (trends.length === 0) {
        return (
            <div
                className="glass-panel"
                style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--subtext-color, #9ca3af)',
                    fontSize: '12px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                }}
            >
                No analytics data yet. Run a repository analysis to start tracking trends.
            </div>
        );
    }

    // Find the max value across all series for scaling the Y axis
    const maxValue = Math.max(
        1,
        ...trends.flatMap((t) => SERIES.map((s) => t[s.key]))
    );

    const innerWidth = CHART_WIDTH - PADDING * 2;
    const innerHeight = CHART_HEIGHT - PADDING * 2;

    const xStep = trends.length > 1 ? innerWidth / (trends.length - 1) : 0;

    const getX = (i: number) => PADDING + i * xStep;
    const getY = (value: number) => PADDING + innerHeight - (value / maxValue) * innerHeight;

    const buildPath = (key: typeof SERIES[number]['key']) =>
        trends
            .map((t, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(t[key]).toFixed(1)}`)
            .join(' ');

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    const labelIndices = Array.from(
        new Set([0, Math.floor(trends.length / 2), trends.length - 1])
    );

    return (
        <div
            className="glass-panel"
            style={{
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                marginBottom: '16px',
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
            }}
        >
            {/* ── Header ───────────────────────────────── */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '10px',
                    width: '100%',
                    boxSizing: 'border-box',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                        style={{
                            fontSize: '10px',
                            background: '#3b82f6',
                            color: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Analytics
                    </span>
                    <h2
                        style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: 'var(--text-color, #f3f4f6)',
                            margin: 0,
                        }}
                    >
                        📈 Issue Trends Over Time
                    </h2>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {SERIES.map((s) => (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600 }}>
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Chart ────────────────────────────────── */}
            <div style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    style={{ width: '100%', height: 'auto', display: 'block', minHeight: '160px' }}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* Horizontal gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                        <line
                            key={frac}
                            x1={PADDING}
                            x2={CHART_WIDTH - PADDING}
                            y1={PADDING + innerHeight * frac}
                            y2={PADDING + innerHeight * frac}
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth={1}
                        />
                    ))}

                    {/* One line per series */}
                    {SERIES.map((s) => (
                        <path
                            key={s.key}
                            d={buildPath(s.key)}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    ))}

                    {/* Data point dots, with native tooltip on hover */}
                    {SERIES.map((s) =>
                        trends.map((t, i) => (
                            <circle
                                key={`${s.key}-${i}`}
                                cx={getX(i)}
                                cy={getY(t[s.key])}
                                r={2.5}
                                fill={s.color}
                            >
                                <title>{`${s.label}: ${t[s.key]} (${formatDate(t.date)})`}</title>
                            </circle>
                        ))
                    )}

                    {/* X-axis date labels: first, middle, last */}
                    {labelIndices.map((i) => (
                        <text
                            key={i}
                            x={getX(i)}
                            y={CHART_HEIGHT - 6}
                            fontSize="9"
                            fill="var(--subtext-color, #9ca3af)"
                            textAnchor="middle"
                        >
                            {formatDate(trends[i].date)}
                        </text>
                    ))}
                </svg>
            </div>

            <p
                style={{
                    fontSize: '10px',
                    color: 'var(--subtext-color, #9ca3af)',
                    margin: '8px 0 0 0',
                    textAlign: 'center',
                }}
            >
                Showing {trends.length} analysis run{trends.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};

export default AnalyticsTrendsChart;
