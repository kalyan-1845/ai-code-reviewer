import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[0] : null);
const GITHUB_REPO = process.env.GITHUB_REPO || (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : null);

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--owner': case '-o': parsed.owner = args[++i]; break;
      case '--repo': case '-r': parsed.repo = args[++i]; break;
      case '--token': case '-t': parsed.token = args[++i]; break;
      case '--help': case '-h':
        console.log(`Usage: node auto_github.js [options]

Options:
  --owner, -o <owner>    GitHub repository owner (env: GITHUB_OWNER)
  --repo, -r <repo>      GitHub repository name (env: GITHUB_REPO)
  --token, -t <token>    GitHub personal access token (env: GITHUB_PAT)
  --help, -h             Show this help message`);
        process.exit(0);
    }
  }
  return parsed;
}

const cliArgs = parseArgs();
const token = GITHUB_TOKEN || cliArgs.token;
const owner = GITHUB_OWNER || cliArgs.owner;
const repo = GITHUB_REPO || cliArgs.repo;

if (!token || token === 'your_github_personal_access_token_here' || token === 'your-github-token') {
  console.error('❌ Error: Please set a valid GITHUB_PAT environment variable');
  process.exit(1);
}

if (!owner) {
  console.error('❌ Error: GITHUB_OWNER must be set. Use GITHUB_OWNER=my-org or --owner my-org');
  process.exit(1);
}

if (!repo) {
  console.error('❌ Error: GITHUB_REPO must be set. Use GITHUB_REPO=my-repo or --repo my-repo');
  process.exit(1);
}

console.log(`🔧 Target repository: ${owner}/${repo}`);

const octokit = new Octokit({ auth: token });

async function autoAssignAndMerge() {
  console.log(`🤖 Starting GitHub Automator for ${owner}/${repo}...`);

  try {
    // 1. Check for 'assign me' in issues
    console.log('\n🔍 Checking for "assign me" comments on open issues...');
    const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    for (const issue of issues) {
      if (issue.pull_request) continue; // Skip PRs, only process issues

      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issue.number,
        per_page: 100
      });

      for (const comment of comments) {
        if (comment.body?.toLowerCase()?.includes('assign me')) {
          const userToAssign = comment.user.login;
          const assignees = issue.assignees.map(a => a.login);
          
          if (!assignees.includes(userToAssign)) {
            console.log(`👉 Assigning @${userToAssign} to Issue #${issue.number}...`);
            await octokit.rest.issues.addAssignees({
              owner,
              repo,
              issue_number: issue.number,
              assignees: [userToAssign]
            });
            console.log(`✅ Assigned @${userToAssign} to Issue #${issue.number}`);
          }
        }
      }
    }

    // 2. Check for Open PRs
    console.log('\n🔍 Checking for open PRs to review and merge...');
    const prs = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    if (prs.length === 0) {
      console.log('✅ No open Pull Requests found.');
    } else {
      for (const pr of prs) {
        console.log(`\n📦 PR #${pr.number}: ${pr.title}`);
        console.log(`   Author: @${pr.user.login}`);
        console.log(`   URL: ${pr.html_url}`);
        console.log(`   Draft: ${pr.draft ? 'Yes' : 'No'}`);

        if (pr.draft) {
          console.log(`   ⏭️ Skipping draft PR #${pr.number}`);
          continue;
        }

        const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
          owner,
          repo,
          issue_number: pr.number,
        });
        const labelNames = labels.map(l => l.name);
        const mergeLabel = process.env.AUTO_MERGE_LABEL || 'gssoc:approved';
        if (!labelNames.includes(mergeLabel)) {
          console.log(`   ⏭️ Skipping PR #${pr.number} — missing label "${mergeLabel}"`);
          continue;
        }

        // Verify PR is mergeable before attempting merge
        if (pr.mergeable === false) {
          console.log(`   ⏭️ Skipping PR #${pr.number} — has merge conflicts (mergeable=false)`);
          continue;
        }

        // Verify CI status — all required status checks must pass
        const { data: combinedStatus } = await octokit.rest.repos.getCombinedStatusForRef({
          owner,
          repo,
          ref: pr.head.sha,
        });
        if (combinedStatus.state === 'failure' || combinedStatus.state === 'error') {
          console.log(`   ⏭️ Skipping PR #${pr.number} — CI checks have not passed (state=${combinedStatus.state})`);
          continue;
        }

        // Verify at least one approved review exists (skip self-approvals)
        const { data: reviews } = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });
        const hasApprovedReview = reviews.some(
          r => r.state === 'APPROVED' && r.user.login !== pr.user.login
        );
        if (!hasApprovedReview) {
          console.log(`   ⏭️ Skipping PR #${pr.number} — no approved review found (self-approvals excluded)`);
          continue;
        }

        console.log(`   Merging PR #${pr.number}...`);
        try {
          await octokit.rest.pulls.merge({
            owner,
            repo,
            pull_number: pr.number,
            merge_method: 'squash'
          });
          console.log(`✅ Merged PR #${pr.number}`);
        } catch (e) {
          console.error(`❌ Failed to merge PR #${pr.number}:`, e.message);
        }
      }
      console.log('\n💡 Auto-merge complete. Draft PRs and PRs without the configured label are skipped.');
    }

    console.log(`\n🎉 Automator finished successfully for ${owner}/${repo}!`);

  } catch (error) {
    console.error(`❌ An error occurred for ${owner}/${repo}:`, error.message);
  }
}

autoAssignAndMerge();
