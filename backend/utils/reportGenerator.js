import fs from 'fs';
import path from 'path';
import { categorizeFinding } from './severityConfig.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SCHEMA_VERSION = '1.0';

function collectFindings(reviewResult) {
  const allFindings = [];
  const severityCount = Object.create(null);
  severityCount.error = 0;
  severityCount.warning = 0;
  severityCount.info = 0;
  const categoryCount = Object.create(null);

  if (reviewResult && reviewResult.fileReviews) {
    for (const [filePath, review] of Object.entries(reviewResult.fileReviews)) {
      const processIssues = (issues, severity) => {
        if (Array.isArray(issues)) {
          issues.forEach(issue => {
            const finalSeverity = issue.severity || severity;
            const category = categorizeFinding(issue);
            const finding = {
              file: filePath,
              line: issue.line || 1,
              severity: finalSeverity,
              category,
              message: issue.description || issue.message || '',
              rule_id: issue.rule_id || issue.rule || 'unknown',
              cwe: issue.cwe,
              owasp: issue.owasp,
            };
            allFindings.push(finding);
            severityCount[finalSeverity] = (severityCount[finalSeverity] || 0) + 1;
            categoryCount[category] = (categoryCount[category] || 0) + 1;
          });
        }
      };

      processIssues(review.bugs, 'error');
      processIssues(review.security, 'error');
      processIssues(review.optimization, 'warning');
      processIssues(review.styling, 'info');
    }
  }

  return { allFindings, severityCount, categoryCount };
}

function generateJSONReport(repoName, files, reviewResult, outputPath) {
  const { allFindings, severityCount, categoryCount } = collectFindings(reviewResult);

  const report = {
    schema_version: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    repository: repoName,
    files_reviewed: Array.isArray(files) ? files.length : 0,
    total_findings: allFindings.length,
    by_severity: severityCount,
    by_category: categoryCount,
    findings: allFindings,
  };

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    return {
      success: true,
      path: outputPath,
      findingCount: allFindings.length,
    };
  } catch (err) {
    console.warn(`Failed to write JSON report: ${err.message}`);
    return { success: false, error: err.message };
  }
}

function generateHTMLReport(repoName, files, reviewResult, outputPath) {
  const { allFindings, severityCount } = collectFindings(reviewResult);

  const severityColors = {
    error: '#ff4444',
    warning: '#ffaa00',
    info: '#0066cc',
  };

  const sortedFindings = allFindings.sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const rankA = severityOrder[a.severity] ?? 3;
    const rankB = severityOrder[b.severity] ?? 3;
    return rankA - rankB;
  });

  const findingRows = sortedFindings.map(f => `
    <tr>
      <td>${escapeHtml(f.file)}</td>
      <td>${escapeHtml(String(f.line))}</td>
      <td><span style="background-color: ${severityColors[f.severity]}; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;">${escapeHtml(f.severity)}</span></td>
      <td>${escapeHtml(f.category)}</td>
      <td>${escapeHtml(f.rule_id)}</td>
      <td><div style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(f.message)}</div></td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review Report - ${escapeHtml(repoName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px; }
    h1 { color: #222; margin-bottom: 10px; font-size: 28px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin: 30px 0; }
    .stat-card { background: #f9f9f9; padding: 20px; border-radius: 6px; text-align: center; border-left: 4px solid #ddd; }
    .stat-card.error { border-left-color: #ff4444; }
    .stat-card.warning { border-left-color: #ffaa00; }
    .stat-card.info { border-left-color: #0066cc; }
    .stat-number { font-size: 32px; font-weight: bold; color: #222; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th { background: #f0f0f0; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f9f9f9; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Code Review Report</h1>
    <div class="meta">
      <strong>Repository:</strong> ${escapeHtml(repoName)}<br>
      <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
      <strong>Files Reviewed:</strong> ${Array.isArray(files) ? files.length : 0}
    </div>

    <div class="stats">
      <div class="stat-card error">
        <div class="stat-number">${severityCount.error}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-number">${severityCount.warning}</div>
        <div class="stat-label">Warnings</div>
      </div>
      <div class="stat-card info">
        <div class="stat-number">${severityCount.info}</div>
        <div class="stat-label">Info</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${allFindings.length}</div>
        <div class="stat-label">Total Findings</div>
      </div>
    </div>

    <h2 style="margin-top: 40px; margin-bottom: 20px; font-size: 20px;">Findings Detail</h2>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Line</th>
          <th>Severity</th>
          <th>Category</th>
          <th>Rule</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        ${findingRows || '<tr><td colspan="6" style="text-align: center; color: #999;">No findings detected!</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <p>Report generated by AI Code Reviewer - Schema v${SCHEMA_VERSION}</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html, 'utf-8');
    return {
      success: true,
      path: outputPath,
      findingCount: allFindings.length,
    };
  } catch (err) {
    console.warn(`Failed to write HTML report: ${err.message}`);
    return { success: false, error: err.message };
  }
}

function classifySarifFinding(finding) {
  if (finding.cwe || finding.owasp) {
    return {
      cwe: finding.cwe || 'CWE-Other',
      owasp: finding.owasp || 'OWASP-Other',
    };
  }

  const haystack = `${finding.rule_id} ${finding.category} ${finding.message}`.toLowerCase();
  if (haystack.includes('password') || haystack.includes('secret') || haystack.includes('token')) {
    return { cwe: 'CWE-798', owasp: 'A07:2021' };
  }
  if (haystack.includes('xss') || haystack.includes('script') || haystack.includes('injection')) {
    return { cwe: 'CWE-79', owasp: 'A03:2021' };
  }
  if (haystack.includes('path') || haystack.includes('traversal')) {
    return { cwe: 'CWE-22', owasp: 'A01:2021' };
  }
  if (finding.category === 'security') {
    return { cwe: 'CWE-200', owasp: 'A01:2021' };
  }
  return { cwe: 'CWE-Other', owasp: 'OWASP-Other' };
}

function sarifLevel(severity) {
  if (severity === 'error' || severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

function generateSARIFReport(repoName, files, reviewResult, outputPath) {
  const { allFindings } = collectFindings(reviewResult);
  const rules = new Map();

  const results = allFindings.map(finding => {
    const classification = classifySarifFinding(finding);
    if (!rules.has(finding.rule_id)) {
      rules.set(finding.rule_id, {
        id: finding.rule_id,
        name: finding.rule_id,
        shortDescription: { text: finding.category || 'RepoSage finding' },
        fullDescription: { text: `RepoSage ${finding.category || 'code review'} finding` },
        properties: {
          tags: [classification.cwe, classification.owasp].filter(Boolean),
          precision: 'medium',
        },
      });
    }

    return {
      ruleId: finding.rule_id,
      level: sarifLevel(finding.severity),
      message: { text: finding.message },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: finding.file },
          region: { startLine: Math.max(1, Number(finding.line) || 1) },
        },
      }],
      properties: {
        severity: finding.severity,
        category: finding.category,
        cwe: classification.cwe,
        owasp: classification.owasp,
      },
    };
  });

  const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'RepoSage AI Code Reviewer',
          informationUri: 'https://github.com/kalyan-1845/ai-code-reviewer',
          rules: Array.from(rules.values()),
        },
      },
      automationDetails: { id: repoName },
      artifacts: (Array.isArray(files) ? files : []).map(file => ({
        location: { uri: typeof file === 'string' ? file : file.name || file.path || String(file) },
      })),
      results,
    }],
  };

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(sarif, null, 2), 'utf-8');
    return {
      success: true,
      path: outputPath,
      findingCount: allFindings.length,
    };
  } catch (err) {
    console.warn(`Failed to write SARIF report: ${err.message}`);
    return { success: false, error: err.message };
  }
}

function getReportPath(format = 'json', outputDir = '.') {
  const ext = format === 'html' || format === 'sarif' ? format : 'json';
  return path.join(outputDir, `review-report.${ext}`);
}

export {
  escapeHtml,
  generateJSONReport,
  generateHTMLReport,
  generateSARIFReport,
  getReportPath,
  SCHEMA_VERSION,
};
