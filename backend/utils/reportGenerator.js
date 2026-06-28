// Generates structured review reports in JSON and HTML formats
import fs from 'fs';

export class ReportGenerator {
  constructor(findings = [], metadata = {}) {
    this.findings = findings;
    this.metadata = {
      timestamp: new Date().toISOString(),
      filesReviewed: metadata.filesReviewed || 0,
      totalFindings: findings.length,
      ...metadata,
    };
  }

  generateJSON() {
    const bySeverity = { error: 0, warning: 0, info: 0 };
    const byCategory = {};

    this.findings.forEach((f) => {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    });

    return {
      schema_version: '1.0',
      timestamp: this.metadata.timestamp,
      files_reviewed: this.metadata.filesReviewed,
      total_findings: this.metadata.totalFindings,
      by_severity: bySeverity,
      by_category: byCategory,
      findings: this.findings.map((f) => ({
        file: f.file,
        line: f.line,
        severity: f.severity || 'info',
        category: f.category || 'general',
        message: f.message,
        rule: f.rule,
      })),
    };
  }

  generateHTML() {
    const json = this.generateJSON();
    const { by_severity, by_category, findings } = json;

    const findingRows = findings
      .map(
        (f) => `
      <tr>
        <td>${f.file}</td>
        <td>${f.line}</td>
        <td><span class="severity ${f.severity}">${f.severity.toUpperCase()}</span></td>
        <td>${f.category}</td>
        <td>${f.rule}</td>
        <td>${f.message}</td>
      </tr>
    `,
      )
      .join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Code Review Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .stat { padding: 10px; border-radius: 4px; text-align: center; }
        .stat.error { background: #fee; color: #c00; }
        .stat.warning { background: #ffe; color: #880; }
        .stat.info { background: #eef; color: #008; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f0f0f0; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
        td { padding: 8px; border-bottom: 1px solid #eee; }
        tr:hover { background: #f9f9f9; }
        .severity { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        .severity.error { background: #fcc; color: #c00; }
        .severity.warning { background: #ffc; color: #880; }
        .severity.info { background: #ccf; color: #008; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Code Review Report</h1>
        <p>Generated: ${json.timestamp}</p>
        <p>Files Reviewed: ${json.files_reviewed} | Total Findings: ${json.total_findings}</p>

        <div class="summary">
          <div class="stat error">
            <div style="font-size: 24px; font-weight: bold;">${by_severity.error || 0}</div>
            <div>Errors</div>
          </div>
          <div class="stat warning">
            <div style="font-size: 24px; font-weight: bold;">${by_severity.warning || 0}</div>
            <div>Warnings</div>
          </div>
          <div class="stat info">
            <div style="font-size: 24px; font-weight: bold;">${by_severity.info || 0}</div>
            <div>Info</div>
          </div>
        </div>

        <h2>Findings by Category</h2>
        <ul>
          ${Object.entries(by_category)
            .map(([category, count]) => `<li>${category}: ${count}</li>`)
            .join('')}
        </ul>

        <h2>Detailed Findings</h2>
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
            ${findingRows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
    `;

    return html;
  }

  saveJSON(outputPath) {
    const data = this.generateJSON();
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    return outputPath;
  }

  saveHTML(outputPath) {
    const html = this.generateHTML();
    fs.writeFileSync(outputPath, html);
    return outputPath;
  }
}

export default ReportGenerator;
