import fs from 'fs';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';

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
      const config = yamlLoad(fileContent) || {};
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
  const message = (finding.message || '').toLowerCase();
  const ruleId = (finding.rule_id || '').toLowerCase();

  if (message.includes('security') || ruleId.includes('security') ||
      message.includes('injection') || message.includes('credential') ||
      message.includes('vulnerability')) {
    return 'security';
  }

  if (message.includes('performance') || ruleId.includes('performance') ||
      message.includes('n+1') || message.includes('cache') ||
      message.includes('optimization')) {
    return 'performance';
  }

  if (message.includes('style') || ruleId.includes('style') ||
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
      return !suppressedRules.has(ruleId);
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
    const rank = severityRank[f.severity] ?? 2;
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
