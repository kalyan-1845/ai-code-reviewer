import logger from './utils/logger.js';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const token = process.env.GITHUB_PAT;

if (!token || token.includes('your_github_personal_access_token_here')) {
  logger.error('❌ Error: Please set a valid GITHUB_PAT in backend/.env');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });
// Set your repository details here
const owner = 'kalyan-1845';
const repo = 'ai-code-reviewer';

async function autoAssignAndMerge() {
  logger.info(`🤖 Starting GitHub Automator for ${owner}/${repo}...`);

  try {
    // 1. Check for 'assign me' in issues
    logger.info('\n🔍 Checking for "assign me" comments on open issues...');
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
            logger.info(`👉 Assigning @${userToAssign} to Issue #${issue.number}...`);
            await octokit.rest.issues.addAssignees({
              owner,
              repo,
              issue_number: issue.number,
              assignees: [userToAssign]
            });
            logger.info(`✅ Assigned @${userToAssign} to Issue #${issue.number}`);
          }
        }
      }
    }

    // 2. Check for Open PRs
    logger.info('\n🔍 Checking for open PRs to review and merge...');
    const prs = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    if (prs.length === 0) {
      logger.info('✅ No open Pull Requests found.');
    } else {
      for (const pr of prs) {
        logger.info(`\n📦 PR #${pr.number}: ${pr.title}`);
        logger.info(`   Author: @${pr.user.login}`);
        logger.info(`   URL: ${pr.html_url}`);
        logger.info(`   Draft: ${pr.draft ? 'Yes' : 'No'}`);

        if (pr.draft) {
          logger.info(`   ⏭️ Skipping draft PR #${pr.number}`);
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
          logger.info(`   ⏭️ Skipping PR #${pr.number} — missing label "${mergeLabel}"`);
          continue;
        }

        logger.info(`   Merging PR #${pr.number}...`);
        try {
          await octokit.rest.pulls.merge({
            owner,
            repo,
            pull_number: pr.number,
            merge_method: 'squash'
          });
          logger.info(`✅ Merged PR #${pr.number}`);
        } catch (e) {
          logger.error(`❌ Failed to merge PR #${pr.number}:`, e.message);
        }
      }
      logger.info('\n💡 Auto-merge complete. Draft PRs and PRs without the configured label are skipped.');
    }

    logger.info('\n🎉 Automator finished successfully!');

  } catch (error) {
    logger.error('❌ An error occurred:', error.message);
  }
}

autoAssignAndMerge();
