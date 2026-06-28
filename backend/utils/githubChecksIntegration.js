// Integrates with GitHub PR Checks API for inline annotations
import axios from 'axios';

export class GitHubChecksIntegration {
  constructor(token, owner, repo) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
  }

  severityToGitHubLevel(severity) {
    const mapping = {
      error: 'failure',
      warning: 'neutral',
      info: 'notice',
    };
    return mapping[severity] || 'notice';
  }

  formatAnnotations(findings) {
    // GitHub limits to 50 annotations per request
    return findings.slice(0, 50).map((finding) => ({
      path: finding.file,
      start_line: finding.line || 1,
      end_line: finding.line || 1,
      annotation_level: this.severityToGitHubLevel(finding.severity || 'info'),
      message: finding.message || 'Code review finding',
      title: finding.rule || 'Finding',
    }));
  }

  async createCheckRun(sha, findings, options = {}) {
    const annotations = this.formatAnnotations(findings);
    const conclusion = findings.some((f) => f.severity === 'error') ? 'failure' : 'success';

    const payload = {
      name: options.checkName || 'Code Review',
      head_sha: sha,
      status: 'completed',
      conclusion,
      output: {
        title: options.title || 'Code Review Results',
        summary: `Found ${findings.length} issues: ${annotations.length} reported`,
        annotations,
      },
    };

    try {
      const response = await this.client.post(`/repos/${this.owner}/${this.repo}/check-runs`, payload);
      return response.data;
    } catch (err) {
      throw new Error(`Failed to create check run: ${err.response?.data?.message || err.message}`);
    }
  }

  async createBatchCheckRuns(sha, findings, options = {}) {
    const batches = [];
    for (let i = 0; i < findings.length; i += 50) {
      batches.push(findings.slice(i, i + 50));
    }

    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const batchOptions = {
        ...options,
        checkName: batches.length > 1 ? `${options.checkName || 'Code Review'} (${i + 1}/${batches.length})` : options.checkName,
      };
      const result = await this.createCheckRun(sha, batches[i], batchOptions);
      results.push(result);
    }

    return results;
  }

  async updateCheckRun(checkRunId, findings, options = {}) {
    const annotations = this.formatAnnotations(findings);
    const conclusion = findings.some((f) => f.severity === 'error') ? 'failure' : 'success';

    const payload = {
      status: 'completed',
      conclusion,
      output: {
        title: options.title || 'Code Review Results',
        summary: `Found ${findings.length} issues: ${annotations.length} reported`,
        annotations,
      },
    };

    try {
      const response = await this.client.patch(`/repos/${this.owner}/${this.repo}/check-runs/${checkRunId}`, payload);
      return response.data;
    } catch (err) {
      throw new Error(`Failed to update check run: ${err.response?.data?.message || err.message}`);
    }
  }
}

export default GitHubChecksIntegration;
