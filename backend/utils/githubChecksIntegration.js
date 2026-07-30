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
  if (!Array.isArray(findings)) return [];
  return findings.map(finding => {
    const rawLine = parseInt(finding.line, 10);
    const line = Number.isInteger(rawLine) && rawLine >= 1 ? rawLine : 1;
    return {
      path: finding.file,
      start_line: line,
      end_line: line,
      annotation_level: severityToGitHubLevel(finding.severity),
      message: finding.message || 'No description provided',
      title: finding.rule_id || 'unknown-rule',
    };
  });
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

    const hasErrorSeverity = batchAnnotations.some(a => a.annotation_level === 'failure');

    const checkRunPayload = {
      owner,
      repo,
      name: 'Code Review',
      head_sha: sha,
      status: 'completed',
      conclusion: hasErrorSeverity ? 'failure' : 'success',
      output: {
        title: `Code Review Results (Batch ${i + 1}/${batches.length})`,
        summary: hasErrorSeverity
          ? `${batchAnnotations.length} finding(s) including errors`
          : `${batchAnnotations.length} finding(s) (no errors)`,
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

export {
  createCheckRun,
  severityToGitHubLevel,
  formatAnnotations,
  batchAnnotations,
};
