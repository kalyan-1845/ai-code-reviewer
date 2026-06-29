import React from 'react';

interface FileStat {
  extension: string;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  emptyLines: number;
}

interface Props {
  files: FileStat[];
}

const LANG_COLORS: Record<string, string> = {
  ts:    '#3178c6',
  tsx:   '#3178c6',
  js:    '#f7df1e',
  jsx:   '#f7df1e',
  py:    '#3776ab',
  css:   '#264de4',
  html:  '#e34c26',
  json:  '#6b7280',
  md:    '#10b981',
  yml:   '#a855f7',
  yaml:  '#a855f7',
  other: '#9ca3af',
};

function getLangColor(ext: string, index: number): string {
  return LANG_COLORS[ext] || `hsl(${index * 47}, 65%, 55%)`;
}

const RepositoryOverview: React.FC<Props> = ({ files }) => {

  const totalStats = files.reduce(
    (acc, file) => ({
      totalLines:   acc.totalLines   + file.totalLines,
      codeLines:    acc.codeLines    + file.codeLines,
      commentLines: acc.commentLines + file.commentLines,
      emptyLines:   acc.emptyLines   + file.emptyLines,
    }),
    { totalLines: 0, codeLines: 0, commentLines: 0, emptyLines: 0 }
  );

  const langMap: Record<string, number> = {};
  files.forEach((f) => {
    const key = f.extension || 'other';
    langMap[key] = (langMap[key] || 0) + 1;
  });

  const totalFiles = files.length || 1;
  const safeTotal  = totalStats.totalLines || 1;

  const langStats = Object.entries(langMap)
    .map(([ext, count], i) => ({
      ext,
      count,
      color: getLangColor(ext, i),
      pct: Math.round((count / totalFiles) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const codePct    = Math.round((totalStats.codeLines    / safeTotal) * 100);
  const commentPct = Math.round((totalStats.commentLines / safeTotal) * 100);
  const emptyPct   = Math.max(0, 100 - codePct - commentPct);

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
      {/* ── Header Row ───────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Title */}
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
            Repository Overview
          </span>
          <h2
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-color, #f3f4f6)',
              margin: 0,
            }}
          >
            📊 Codebase Summary
          </h2>
        </div>

        {/* Summary stat pills */}
        <div className="summary-pills">
          {[
            { label: 'Files',       value: files.length,                          color: '#60a5fa' },
            { label: 'Total Lines', value: totalStats.totalLines.toLocaleString(), color: '#22c55e' },
            { label: 'Code Lines',  value: totalStats.codeLines.toLocaleString(),  color: '#a855f7' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                textAlign: 'center',
                padding: '6px 12px',
                background: `${s.color}12`,
                border: `1px solid ${s.color}30`,
                borderRadius: '8px',
                minWidth: '70px',
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 800, color: s.color, display: 'block' }}>
                {s.value}
              </span>
              <span style={{ fontSize: '9px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600, textTransform: 'uppercase' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two Column Grid (responsive → 1 col on mobile) ──────────────────────── */}
      <div className="repo-overview-grid">

        {/* LEFT: File Type Distribution */}
        <div className="chart-sub-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-color, #f3f4f6)',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              🗂 File Type Distribution
            </h3>
            <span style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)' }}>
              {files.length} files · {langStats.length} lang{langStats.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Stacked Bar */}
          <div
            className="chart-bar-track"
            style={{
              height: '14px',
              borderRadius: '7px',
              marginBottom: '10px',
            }}
          >
            {langStats.map((lang) => (
              <div
                key={lang.ext}
                title={`${lang.ext.toUpperCase()}: ${lang.pct}% (${lang.count} files)`}
                style={{
                  height: '100%',
                  width: `${lang.pct}%`,
                  background: lang.color,
                  transition: 'width 0.6s ease-out',
                  minWidth: lang.pct > 0 ? '2px' : '0',
                }}
              />
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {langStats.map((lang) => (
              <div key={lang.ext} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: lang.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600 }}>
                  {lang.ext.toUpperCase()}{' '}
                  <span style={{ color: 'var(--text-color, #f3f4f6)' }}>{lang.pct}%</span>
                  {' '}
                  <span style={{ fontWeight: 400 }}>({lang.count})</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Code vs Comment vs Empty */}
        <div className="chart-sub-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-color, #f3f4f6)',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              📋 Code vs Comments vs Empty
            </h3>
            <span style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)' }}>
              {totalStats.totalLines.toLocaleString()} lines
            </span>
          </div>

          {/* Stacked Bar */}
          <div
            className="chart-bar-track"
            style={{
              height: '14px',
              borderRadius: '7px',
              marginBottom: '10px',
            }}
          >
            <div style={{ height: '100%', width: `${codePct}%`,    background: '#3b82f6', transition: 'width 0.6s ease-out' }} title={`Code: ${codePct}%`} />
            <div style={{ height: '100%', width: `${commentPct}%`, background: '#22c55e', transition: 'width 0.6s ease-out' }} title={`Comments: ${commentPct}%`} />
            <div style={{ height: '100%', width: `${emptyPct}%`,   background: '#94a3b8', transition: 'width 0.6s ease-out' }} title={`Empty: ${emptyPct}%`} />
          </div>

          {/* 3 Stat Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
            {[
              { label: 'Code',     value: totalStats.codeLines,   pct: codePct,    color: '#3b82f6' },
              { label: 'Comments', value: totalStats.commentLines, pct: commentPct, color: '#22c55e' },
              { label: 'Empty',    value: totalStats.emptyLines,   pct: emptyPct,   color: '#94a3b8' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: `${s.color}10`,
                  border: `1px solid ${s.color}25`,
                  borderRadius: '8px',
                  padding: '8px 6px',
                  textAlign: 'center',
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 800, color: s.color, display: 'block' }}>
                  {s.pct}%
                </span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--subtext-color, #9ca3af)', textTransform: 'uppercase', display: 'block' }}>
                  {s.label}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--subtext-color, #9ca3af)' }}>
                  {s.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Legend Row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Code',     color: '#3b82f6' },
              { label: 'Comments', color: '#22c55e' },
              { label: 'Empty',    color: '#94a3b8' },
            ].map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color }} />
                <span style={{ fontSize: '10px', color: 'var(--subtext-color, #9ca3af)', fontWeight: 600 }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default RepositoryOverview;