import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const token = process.env.GITHUB_PAT;

if (!token || token.includes('your_github_personal_access_token_here')) {
  console.error('❌ Error: Please set a valid GITHUB_PAT in backend/.env');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });
// Set your repository details here
const owner = 'kalyan-1845';
const repo = 'ai-code-reviewer';

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

      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issue.number
      });

      for (const comment of comments) {
        if (comment.body.toLowerCase().includes('assign me')) {
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

    console.log('\n🎉 Automator finished successfully!');

  } catch (error) {
    console.error('❌ An error occurred:', error.message);
  }
}

autoAssignAndMerge();
