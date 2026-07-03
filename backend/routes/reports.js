import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import PDFDocument from 'pdfkit';
import escapeHtml from 'lodash.escape';
import { requireApiKey } from '../utils/authMiddleware.js';
import { sanitizeFilename, redisClient } from './context.js';

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many export requests. Please slow down and retry after 1 minute.' }
});

const router = Router();

router.post('/api/reports/html', requireApiKey, exportLimiter, (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  const safeRepoName = sanitizeFilename(repoName);

  let fileRows = '';

  if (analysis && analysis.fileReviews) {
    Object.keys(analysis.fileReviews).forEach(file => {
      const review = analysis.fileReviews[file];
      const allFindings = [
        ...(review.bugs || []).map(f => ({ ...f, category: 'Bug' })),
        ...(review.security || []).map(f => ({ ...f, category: 'Security' })),
        ...(review.optimization || []).map(f => ({ ...f, category: 'Optimization' })),
        ...(review.styling || []).map(f => ({ ...f, category: 'Styling' }))
      ];

      allFindings.forEach(f => {
        fileRows += `
          <tr>
            <td><strong>${escapeHtml(file)}</strong></td>
            <td><span class="badge badge-${escapeHtml(f.category).toLowerCase()}">${escapeHtml(f.category)}</span></td>
            <td>${escapeHtml(String(f.line))}</td>
            <td><strong>${escapeHtml(f.type)}</strong></td>
            <td>${escapeHtml(f.description)}</td>
            <td><code class="code-font">${escapeHtml(f.suggestion)}</code></td>
          </tr>
        `;
      });
    });
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>RepoSage Code Audit - ${escapeHtml(repoName)}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #0f172a;
          color: #f1f5f9;
          margin: 0;
          padding: 40px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: #1e293b;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
        }
        h1 {
          font-size: 28px;
          margin-top: 0;
          color: #a855f7;
          border-bottom: 2px solid rgba(168,85,247,0.2);
          padding-bottom: 15px;
        }
        .meta {
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 25px;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 13px;
        }
        th {
          background-color: rgba(255,255,255,0.03);
          color: #e2e8f0;
          font-weight: 600;
        }
        tr:hover {
          background-color: rgba(255,255,255,0.04);
        }
        tr:nth-child(even) {
          background-color: rgba(255,255,255,0.015);
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-bug { background: #ef4444; color: white; }
        .badge-security { background: #f59e0b; color: #0f172a; }
        .badge-optimization { background: #3b82f6; color: white; }
        .badge-styling { background: #10b981; color: white; }
        .code-font {
          font-family: monospace;
          background: rgba(0,0,0,0.2);
          padding: 4px 8px;
          border-radius: 4px;
          color: #c084fc;
          font-size: 12px;
          white-space: pre-wrap;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🛡️ RepoSage AI Code Audit Report</h1>
        <div class="meta">
          <strong>Repository Name:</strong> ${escapeHtml(repoName)}<br>
          <strong>Report Timestamp:</strong> ${new Date().toLocaleString()}<br>
          <strong>Audited with:</strong> RepoSage GSSoC '26 Audit Engine
        </div>
        <table>
          <thead>
            <tr>
              <th>File Path</th>
              <th>Category</th>
              <th>Line</th>
              <th>Finding Type</th>
              <th>Description</th>
              <th>Actionable Suggestion</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows || '<tr><td colspan="6" style="text-align:center;">🎉 No issues found! Your codebase is clean.</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
          RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code (GSSoC).
        </div>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${safeRepoName}_AUDIT_REPORT.html"`);
  return res.send(html);
});

router.post('/api/reports/pdf', requireApiKey, exportLimiter, (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  const fileReviews = analysis.fileReviews || {};
  const metrics = analysis.metrics || {};
  const categories = [
    { key: 'bugs', label: 'Bug', badge: 'BUG', color: '#dc2626' },
    { key: 'security', label: 'Security', badge: 'SECURITY', color: '#d97706' },
    { key: 'optimization', label: 'Optimization', badge: 'PERF', color: '#2563eb' },
    { key: 'styling', label: 'Styling', badge: 'STYLE', color: '#059669' }
  ];

  const findingsByFile = Object.entries(fileReviews).map(([file, review]) => {
    const findings = categories.flatMap(category => (
      (review[category.key] || []).map(finding => ({ ...finding, category }))
    ));
    return { file, findings };
  });

  const summary = categories.reduce((acc, category) => {
    acc[category.key] = findingsByFile.reduce((total, { findings }) => (
      total + findings.filter(finding => finding.category.key === category.key).length
    ), 0);
    return acc;
  }, {});
  const totalFindings = Object.values(summary).reduce((total, count) => total + count, 0);
  const safeRepoName = sanitizeFilename(repoName);

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRepoName}_AUDIT_REPORT.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  });
  doc.on('error', error => {
    console.error('PDF report generation failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  });

  const ensureSpace = (needed = 72) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  };

  const normalizeText = value => String(value ?? 'N/A').replace(/\s+/g, ' ').trim();

  const addSectionTitle = title => {
    ensureSpace(48);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text(title);
    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.8);
  };

  const addBadge = (label, color) => {
    const x = doc.x;
    const y = doc.y + 1;
    const width = doc.widthOfString(label) + 12;
    doc.save().roundedRect(x, y, width, 16, 4).fill(color).restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text(label, x + 6, y + 4, { lineBreak: false });
    doc.x = x + width + 8;
    doc.y = y;
  };

  doc.font('Helvetica-Bold').fontSize(24).fillColor('#111827').text('RepoSage AI Code Audit Report');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
    .text(`Repository: ${repoName}`)
    .text(`Report Timestamp: ${new Date().toLocaleString()}`)
    .text("Audited with: RepoSage GSSoC '26 Audit Engine");

  addSectionTitle('Summary');
  doc.font('Helvetica').fontSize(11).fillColor('#111827')
    .text(`Files scanned: ${Object.keys(fileReviews).length}`)
    .text(`Total findings: ${totalFindings}`)
    .text(`Bugs: ${summary.bugs}   Security: ${summary.security}   Performance: ${summary.optimization}   Styling: ${summary.styling}`);

  addSectionTitle('File Findings');
  if (totalFindings === 0) {
    doc.font('Helvetica').fontSize(11).fillColor('#059669').text('No issues found. Your codebase is clean.');
  } else {
    findingsByFile.forEach(({ file, findings }) => {
      if (findings.length === 0) return;
      ensureSpace(92);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(file);
      doc.moveDown(0.35);

      findings.forEach(finding => {
        ensureSpace(112);
        addBadge(finding.category.badge, finding.category.color);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827')
          .text(`${normalizeText(finding.type)} - Line ${normalizeText(finding.line)}`, doc.x, doc.y, { width: 380 });
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(`Description: ${normalizeText(finding.description)}`, { width: 490 });
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
          .text(`Suggestion: ${normalizeText(finding.suggestion)}`, { width: 490 });
        doc.moveDown(0.6);
      });
    });
  }

  const metricEntries = Object.entries(metrics);
  if (metricEntries.length > 0) {
    addSectionTitle('Code Metrics');
    metricEntries.forEach(([file, fileMetrics]) => {
      ensureSpace(42);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(file);
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
        .text(`Total: ${fileMetrics.totalLines ?? 0}   Code: ${fileMetrics.codeLines ?? 0}   Comments: ${fileMetrics.commentLines ?? 0}   Empty: ${fileMetrics.emptyLines ?? 0}`);
      doc.moveDown(0.45);
    });
  }

  doc.end();
});

export default router;
