import fs from 'fs';
import path from 'path';
import { load as yamlLoad, CORE_SCHEMA } from 'js-yaml';

const DEFAULT_CONFIG = {
  severity: {
    security: 'error',
    performance: 'warning',
    style: 'info',
  },
  suppress: [],
};

function loadConfigFile(repoPath) {
  const configPath = path.join(repoPath, '.codereview.yml');

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      // Pin the safe CORE_SCHEMA explicitly: .codereview.yml is
      // user-controlled, so the parser must never execute custom tags.
      const config = yamlLoad(fileContent, { schema: CORE_SCHEMA }) || {};
      return mergeWithDefaults(config);
    }
  } catch (err) {
    console.warn(`Failed to load .codereview.yml: ${err.message}`);
  }

  return DEFAULT_CONFIG;
}

function mergeWithDefaults(userConfig) {
  return {
    severity: {
      ...DEFAULT_CONFIG.severity,
      ...(userConfig.severity || {}),
    },
    suppress: Array.isArray(userConfig.suppress) ? userConfig.suppress : [],
  };
}

function categorizeFinding(finding) {
  if (!finding) return 'other';
  const message = (finding.description || finding.message || '').toLowerCase();
  const ruleId = String(finding.rule || finding.rule_id || '');

  if (message.includes('security') || ruleId.toLowerCase().includes('security') ||
      message.includes('injection') || message.includes('credential') ||
      message.includes('vulnerability')) {
    return 'security';
  }

  if (message.includes('performance') || ruleId.toLowerCase().includes('performance') ||
      message.includes('n+1') || message.includes('cache') ||
      message.includes('optimization')) {
    return 'performance';
  }

  if (message.includes('style') || ruleId.toLowerCase().includes('style') ||
      message.includes('formatting') || message.includes('comma')) {
    return 'style';
  }

  return 'other';
}

function applySeverityConfig(findings, config) {
  const suppressedRules = new Set(config.suppress || []);
  const severityMap = config.severity || DEFAULT_CONFIG.severity;

  return findings
    .filter(finding => {
      const ruleId = finding.rule_id || finding.rule;
      return !ruleId || !suppressedRules.has(ruleId);
    })
    .map(finding => {
      const category = categorizeFinding(finding);
      const mappedSeverity = severityMap[category] || finding.severity;

      return {
        ...finding,
        severity: mappedSeverity,
        category,
      };
    });
}

function filterByMinimumSeverity(findings, minimumSeverity = 'error') {
  const severityRank = {
    error: 0,
    warning: 1,
    info: 2,
  };

  const minRank = severityRank[minimumSeverity] ?? 0;

  return findings.filter(f => {
    // Default unknown severities (e.g. 'critical', 'high') to 0 (highest severity)
    // so they are not filtered out when filtering for errors.
    const rank = severityRank[f.severity] ?? 0;
    return rank <= minRank;
  });
}

function validateConfig(config) {
  const errors = [];

  if (config.severity) {
    const validSeverities = ['error', 'warning', 'info'];
    for (const [category, severity] of Object.entries(config.severity)) {
      if (!validSeverities.includes(severity)) {
        errors.push(`Invalid severity "${severity}" for category "${category}". Must be one of: ${validSeverities.join(', ')}`);
      }
    }
  }

  if (config.suppress && !Array.isArray(config.suppress)) {
    errors.push('suppress must be an array of rule IDs');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const configSchema = {
  severity: {
    description: 'Map categories to severity levels',
    type: 'object',
    properties: {
      security: { type: 'string', enum: ['error', 'warning', 'info'] },
      performance: { type: 'string', enum: ['error', 'warning', 'info'] },
      style: { type: 'string', enum: ['error', 'warning', 'info'] },
    },
  },
  suppress: {
    description: 'Array of rule IDs to suppress',
    type: 'array',
    items: { type: 'string' },
  },
};

export {
  loadConfigFile,
  applySeverityConfig,
  filterByMinimumSeverity,
  validateConfig,
  categorizeFinding,
  DEFAULT_CONFIG,
  configSchema,
};
