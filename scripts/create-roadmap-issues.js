// scripts/create-roadmap-issues.js
const fs = require('fs');

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN environment variable is not set');
  process.exit(1);
}

const repoOwner = 'kalyan-1845';
const repoName = 'ai-code-reviewer';

const data = JSON.parse(fs.readFileSync('roadmap/phases.json', 'utf-8'));
const phases = data.phases;

// Load existing progress if any
let progress = {};
if (fs.existsSync('roadmap/created-issues.json')) {
  try {
    const existing = JSON.parse(fs.readFileSync('roadmap/created-issues.json', 'utf-8'));
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      progress = existing;
    } else if (existing && existing.issues && Array.isArray(existing.issues)) {
      // Migrate from old array format
      for (const url of existing.issues) {
        if (url.includes('/issues/605')) {
          progress["25"] = url;
        }
      }
    }
  } catch (e) {
    console.warn('Could not parse existing created-issues.json, starting fresh:', e.message);
  }
}

async function createIssueWithRetry(phase, retries = 5, delay = 2000) {
  const bodyData = {
    title: phase.title,
    body: `## Phase ${phase.id}\n${phase.description}\n\n### Acceptance Criteria\n${phase.acceptance.map(a => `- ${a}`).join('\n')}`
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Node-Fetch'
        },
        body: JSON.stringify(bodyData)
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`Attempt ${attempt} failed for Phase ${phase.id}: status ${response.status}`, err);
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          // Retryable status codes
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        return null;
      }

      const data = await response.json();
      console.log(`Successfully created issue for Phase ${phase.id}: ${data.html_url}`);
      return data.html_url;
    } catch (error) {
      console.error(`Attempt ${attempt} error for Phase ${phase.id}:`, error.message || error);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  return null;
}

(async () => {
  for (const phase of phases) {
    if (progress[phase.id]) {
      console.log(`Phase ${phase.id} already created: ${progress[phase.id]}`);
      continue;
    }

    // Small baseline delay between success calls to avoid spam/rate limit
    await new Promise(resolve => setTimeout(resolve, 1500));
    const url = await createIssueWithRetry(phase);
    if (url) {
      progress[phase.id] = url;
      // Save progress incrementally so we don't lose state if interrupted
      fs.writeFileSync('roadmap/created-issues.json', JSON.stringify(progress, null, 2));
    }
  }
  
  console.log(`Finished creating issues. Progress saved to roadmap/created-issues.json`);
})();
