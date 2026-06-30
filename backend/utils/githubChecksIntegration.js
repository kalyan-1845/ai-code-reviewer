const GITHUB_API_BASE = 'https://api.github.com';
const MAX_ANNOTATIONS_PER_REQUEST = 50;

function severityToGitHubLevel(severity) {
  const levelMap = {
    error: 'failure',
    warning: 'neutral',
    info: 'notice',
  };
  return levelMap[severity] || 'notice';
}

function formatAnnotations(findings) {
  return findings.map(finding => ({
    path: finding.file,
    start_line: finding.line,
    end_line: finding.line,
    annotation_level: severityToGitHubLevel(finding.severity),
    message: finding.message,
    title: finding.rule_id,
  }));
}

function batchAnnotations(annotations, batchSize = MAX_ANNOTATIONS_PER_REQUEST) {
  const batches = [];
  for (let i = 0; i < annotations.length; i += batchSize) {
    batches.push(annotations.slice(i, i + batchSize));
  }
  return batches;
}

async function createCheckRun(octokit, owner, repo, sha, findings) {
  if (!octokit || !owner || !repo || !sha) {
    throw new Error('Missing required parameters: octokit, owner, repo, sha');
  }

  if (!findings || findings.length === 0) {
    console.log('No findings to report as check run');
    return null;
  }

  const annotations = formatAnnotations(findings);
  const batches = batchAnnotations(annotations);
  const checkRunIds = [];

  for (let i = 0; i < batches.length; i++) {
    const batchAnnotations = batches[i];
    const isLastBatch = i === batches.length - 1;

    const hasErrorSeverity = findings.some(f => f.severity === 'error');

    const checkRunPayload = {
      owner,
      repo,
      name: 'Code Review',
      head_sha: sha,
      status: 'completed',
      conclusion: hasErrorSeverity ? 'failure' : 'success',
      output: {
        title: `Code Review Results (Batch ${i + 1}/${batches.length})`,
        summary: `${findings.length} finding(s) detected`,
        annotations: batchAnnotations,
      },
    };

    try {
      const response = await octokit.rest.checks.create(checkRunPayload);
      checkRunIds.push(response.data.id);
      console.log(`Check run batch ${i + 1} created with ID: ${response.data.id}`);
    } catch (error) {
      console.error(`Failed to create check run batch ${i + 1}:`, error.message);
      throw error;
    }
  }

  return {
    checkRunIds,
    totalAnnotations: annotations.length,
    batchCount: batches.length,
  };
}

module.exports = {
  createCheckRun,
  severityToGitHubLevel,
  formatAnnotations,
  batchAnnotations,
};
