import { Octokit } from '@octokit/rest';
import { pathToFileURL } from 'url';
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

// Resolve whether this module is the entry script so the environment
// validation and the automator only run for `node auto_github.js`, never when
// the exported helpers are imported by tests.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
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
}

const octokit = new Octokit({ auth: token || 'unused-token-when-imported' });

// Issue #3579: the previous approval check only excluded the PR author, so the
// bot's OWN "APPROVE" review (which the pipeline itself posts after adding the
// `gssoc:approved` label) satisfied the check and the PR was squash-merged with
// no human reviewer in the loop. Auto-merge must only ever trigger on a real
// human approval from an account that is neither the PR author, the automation
// account holding the token, nor a generic bot account.
export function isBotUser(user, botLogin) {
  // Missing user info, generic bot accounts, and the automation account
  // holding the token never count as a human reviewer.
  return !user || user.type === 'Bot' || user.login === botLogin;
}

export function isApprovedByHuman(reviews, prAuthorLogin, botLogin) {
  if (!Array.isArray(reviews)) return false;
  return reviews.some(
    r => r.state === 'APPROVED' &&
      !!r.user && r.user.login !== prAuthorLogin &&
      !isBotUser(r.user, botLogin)
  );
}

async function autoAssignAndMerge() {
  console.log(`🤖 Starting GitHub Automator for ${owner}/${repo}...`);

  // Auto-merge is an explicit, high-risk action. It only runs when the operator
  // opts in via AUTO_MERGE_ENABLED=true; the default is off.
  const autoMergeEnabled = (process.env.AUTO_MERGE_ENABLED || '').toLowerCase() === 'true';
  if (!autoMergeEnabled) {
    console.log('⏭️  Auto-merge disabled — set AUTO_MERGE_ENABLED=true to enable squash-merging of labelled PRs.');
  } else {
    console.log('🚦 Auto-merge enabled (AUTO_MERGE_ENABLED=true).');
  }

  let botLogin = null;
  if (autoMergeEnabled) {
    try {
      const { data: authUser } = await octokit.rest.users.getAuthenticated();
      botLogin = authUser.login;
      console.log(`🤖 Running as @${botLogin} — this account's own approvals never count as human review.`);
    } catch (err) {
      console.error(`❌ Failed to resolve authenticated user: ${err.message}`);
      botLogin = null;
    }
  }

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

        // Verify at least one approved review from a real human exists.
        // Approvals from the PR author, generic bot accounts, or the automation
        // account holding this token (the same account that posts the bot
        // review and adds the gssoc:approved label) never count.
        if (!autoMergeEnabled) {
          console.log(`   ⏭️ Skipping PR #${pr.number} — auto-merge is disabled (set AUTO_MERGE_ENABLED=true)`);
          continue;
        }
        const { data: reviews } = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });
        if (!isApprovedByHuman(reviews, pr.user.login, botLogin)) {
          console.log(`   ⏭️ Skipping PR #${pr.number} — no human-approved review found (bot, author, and token-account approvals are excluded)`);
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

// Only run the automator when executed directly (node auto_github.js), so the
// exported helpers can be imported by tests without side effects.
if (isMain) {
  autoAssignAndMerge();
}
