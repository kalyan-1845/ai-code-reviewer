// Classifies and filters code review findings by severity level
export class SeverityClassifier {
  constructor(config = {}) {
    this.severityMap = config.severityMap || {
      security: 'error',
      performance: 'warning',
      style: 'info',
      complexity: 'warning',
      maintainability: 'warning',
      testing: 'info',
    };

    this.suppressedRules = config.suppressedRules || [];
    this.failOnSeverity = config.failOnSeverity || 'error';
  }

  classifyFinding(finding) {
    const category = finding.category || 'general';
    const severity = this.severityMap[category] || 'info';

    return {
      ...finding,
      severity,
      suppressed: this.suppressedRules.includes(finding.rule),
    };
  }

  filterFindingsBySeverity(findings, minSeverity = 'info') {
    const severityOrder = { error: 3, warning: 2, info: 1 };
    const minLevel = severityOrder[minSeverity] || 1;

    return findings
      .map((f) => this.classifyFinding(f))
      .filter((f) => !f.suppressed && severityOrder[f.severity] >= minLevel);
  }

  groupFindingsBySeverity(findings) {
    const grouped = { error: [], warning: [], info: [] };
    findings.forEach((f) => {
      const classified = this.classifyFinding(f);
      if (!classified.suppressed) {
        grouped[classified.severity].push(classified);
      }
    });
    return grouped;
  }

  shouldFailBuild(findings) {
    const severityOrder = { error: 3, warning: 2, info: 1 };
    const failLevel = severityOrder[this.failOnSeverity] || 3;

    return findings.some((f) => {
      const classified = this.classifyFinding(f);
      return !classified.suppressed && severityOrder[classified.severity] >= failLevel;
    });
  }

  getSummary(findings) {
    const classified = findings.map((f) => this.classifyFinding(f));
    const grouped = { error: 0, warning: 0, info: 0, suppressed: 0 };

    classified.forEach((f) => {
      if (f.suppressed) {
        grouped.suppressed += 1;
      } else {
        grouped[f.severity] += 1;
      }
    });

    return grouped;
  }
}

export default SeverityClassifier;
