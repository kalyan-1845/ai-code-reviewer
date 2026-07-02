import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { apiFetch } from '../utils/api';

// Theme-aware color maps for Recharts (which requires JS string props, not CSS vars)
const THEME_COLORS = {
  dark: {
    grid: '#334155',
    axis: '#94a3b8',
    tooltipBg: '#0f172a',
    tooltipBorder: 'rgba(255,255,255,0.08)',
    tooltipText: '#f1f5f9',
    tooltipItem: '#e2e8f0',
    title: '#c084fc',
  },
  light: {
    grid: '#e2e8f0',
    axis: '#64748b',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(15,23,42,0.12)',
    tooltipText: '#1e293b',
    tooltipItem: '#334155',
    title: '#8b5cf6',
  },
};

interface MetricsChartProps {
  theme?: 'dark' | 'light';
  reviewId?: string | null;
}

export const MetricsChart: React.FC<MetricsChartProps> = ({ theme = 'dark', reviewId }) => {
  const colors = THEME_COLORS[theme];
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!reviewId) {
      setChartData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    apiFetch(`/api/analytics/trends?reviewId=${encodeURIComponent(reviewId)}`)
      .then((res) => {
        if (cancelled) return null;
        if (!res.ok) throw new Error("Failed to fetch analytics trends");
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const formatted = (data.trends || []).map((t: any) => ({
          month: t.date ? new Date(t.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A",
          bugs: t.totalBugs || 0,
          security: t.totalSecurityIssues || 0,
          healthScore: t.avgHealthScore ?? 0,
        }));
        setChartData(formatted.length > 0 ? formatted : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("MetricsChart fetch error:", err);
        setError(err.message);
        setChartData([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reviewId]);


  return (
    <div 
      className="chart-container" 
      style={{ 
        height: 350, 
      }}
    >
      <h3 style={{ color: colors.title, marginTop: 0, marginBottom: '20px', fontSize: '14px', fontWeight: 700 }}>
        Codebase Metrics Overview
      </h3>
      {loading && (
        <div style={{ color: colors.axis, fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>
          Loading trends...
        </div>
      )}
      {error && (
        <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>
          Failed to load analytics: {error}
        </div>
      )}
      {!loading && !error && chartData && chartData.length === 0 && (
        <div style={{ color: colors.axis, fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>
          No analytics data yet. Analyze a repository to see trends.
        </div>
      )}
      {!loading && !error && chartData && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis 
              dataKey="month" 
              stroke={colors.axis} 
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              stroke={colors.axis} 
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: colors.tooltipBg, 
                border: `1px solid ${colors.tooltipBorder}`, 
                borderRadius: '8px', 
                color: colors.tooltipText,
                boxShadow: theme === 'dark' 
                  ? '0 4px 16px rgba(0,0,0,0.4)' 
                  : '0 4px 16px rgba(0,0,0,0.1)',
              }} 
              itemStyle={{ color: colors.tooltipItem }}
              labelStyle={{ color: colors.tooltipText, fontWeight: 600 }}
            />
            <Line type="monotoneX" dataKey="healthScore" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} name="Health Score" />
            <Line type="monotoneX" dataKey="bugs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} name="Bugs" />
            <Line type="monotoneX" dataKey="security" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} name="Security Issues" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};