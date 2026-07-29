/**
 * github-action/src/reviewer.js
 * ------------------------------
 * Reviewer engine extension for Issue #3193:
 * Differential Line-Anchor Locking, Auto-Resolution & Suppression of PR Comments.
 */

import { mapOldLineToNew } from '../utils/diffHunkMapper.js';

const GET_REVIEW_THREADS_QUERY = `
  query getPRReviewThreads($owner: String!, $repo: String!, $pullNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pullNumber) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            originalLine
            comments(first: 10) {
              nodes {
                id
                databaseId
                body
                author {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
`;

const RESOLVE_THREAD_MUTATION = `
  mutation resolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread {
        id
        isResolved
      }
    }
  }
`;

/**
 * Fetch open review threads and historical inline comments for a Pull Request via GitHub GraphQL and REST APIs.
 *
 * @param {object} octokit Octokit instance
 * @param {{ owner: string, repo: string, pullNumber: number }} context
 * @returns {Promise<{ threads: Array<object>, existingComments: Array<object> }>}
 */
export async function fetchExistingCommentsAndThreads(octokit, { owner, repo, pullNumber }) {
  let existingComments = [];
  let threads = [];

  // 1. Fetch REST review comments
  try {
    const res = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    existingComments = res.data || [];
  } catch (err) {
    console.warn(`⚠️ Could not fetch REST review comments: ${err.message}`);
  }

  // 2. Fetch GraphQL review threads
  try {
    const gqlRes = await octokit.graphql(GET_REVIEW_THREADS_QUERY, {
      owner,
      repo,
      pullNumber,
    });
    const nodes = gqlRes?.repository?.pullRequest?.reviewThreads?.nodes || [];
    threads = nodes;
  } catch (err) {
    console.warn(`⚠️ Could not fetch GraphQL review threads: ${err.message}`);
  }

  return { threads, existingComments };
}

/**
 * Automatically resolve PR review threads where the flagged line was fixed/deleted in the latest commit,
 * or where the AI no longer flags an issue on that line.
 *
 * @param {object} octokit Octokit instance
 * @param {{ owner: string, repo: string, pullNumber: number }} context
 * @param {{ threads: Array<object>, diff: string, newIssues: Array<object> }} params
 * @returns {Promise<{ resolvedCount: number, resolvedThreadIds: Array<string> }>}
 */
export async function autoResolveFixedThreads(octokit, { owner, repo, pullNumber }, { threads = [], diff = '', newIssues = [] }) {
  let resolvedCount = 0;
  const resolvedThreadIds = [];

  if (!threads || threads.length === 0) {
    return { resolvedCount: 0, resolvedThreadIds: [] };
  }

  for (const thread of threads) {
    // Skip if already resolved
    if (thread.isResolved) continue;

    const threadComments = thread.comments?.nodes || [];
    const isBotThread = threadComments.some(c =>
      c.body?.includes('RepoSage') ||
      c.body?.includes('<!-- RepoSage Review Comment -->') ||
      c.author?.login?.includes('reposage') ||
      c.author?.login?.includes('github-actions') ||
      c.author?.login?.endsWith('[bot]')
    );

    if (!isBotThread) continue;

    const origLine = thread.line || thread.originalLine;
    const filePath = thread.path;

    if (!filePath || !origLine) continue;

    // Run line-anchor math against new diff
    const { newLine, isDeleted } = mapOldLineToNew(diff, filePath, origLine);

    // Check if new AI review still flags an issue on this file & line
    const stillHasIssue = newIssues.some(issue =>
      issue.path === filePath &&
      (issue.line === newLine || issue.line === origLine)
    );

    // Auto-resolve if the line was deleted OR if no active issue remains on that line
    if (isDeleted || !stillHasIssue) {
      try {
        await octokit.graphql(RESOLVE_THREAD_MUTATION, { threadId: thread.id });
        resolvedCount++;
        resolvedThreadIds.push(thread.id);
        console.log(`✅ Auto-resolved PR review thread ${thread.id} on ${filePath}:${origLine} (${isDeleted ? 'line deleted' : 'issue fixed'})`);
      } catch (err) {
        console.warn(`⚠️ Could not auto-resolve review thread ${thread.id}: ${err.message}`);
      }
    }
  }

  return { resolvedCount, resolvedThreadIds };
}

/**
 * Filter out duplicate new inline comments if an open, unresolved thread or identical comment
 * already exists for the same conceptual file & line (taking diff hunk offsets into account).
 *
 * @param {Array<object>} newComments Array of proposed comments [{ path, line, body }]
 * @param {Array<object>} existingThreads Array of GraphQL review threads
 * @param {Array<object>} existingComments Array of REST review comments
 * @param {string} diff Current git diff string
 * @returns {Array<object>} Filtered list of non-duplicate comments to post
 */
export function filterDuplicateComments(newComments = [], existingThreads = [], existingComments = [], diff = '') {
  if (!Array.isArray(newComments) || newComments.length === 0) return [];

  const filtered = [];

  for (const comment of newComments) {
    const { path, line, body } = comment;

    // 1. Check REST existing comments
    const restDuplicate = existingComments.some(c => {
      if (c.path !== path) return false;
      // Match line directly or via mapped offset
      const mapped = mapOldLineToNew(diff, path, c.line || c.original_line);
      const lineMatch = c.line === line || mapped.newLine === line;
      const bodyMatch = c.body === body || (c.body && body && c.body.trim() === body.trim());
      return lineMatch && bodyMatch;
    });

    if (restDuplicate) {
      console.log(`⏭️ Suppressing duplicate comment on ${path}:${line} (REST comment exists)`);
      continue;
    }

    // 2. Check GraphQL active (unresolved) review threads
    const activeThreadDuplicate = existingThreads.some(thread => {
      if (thread.isResolved) return false;
      if (thread.path !== path) return false;

      const mapped = mapOldLineToNew(diff, path, thread.line || thread.originalLine);
      const lineMatch = thread.line === line || mapped.newLine === line;

      // Check if thread author/content matches
      const threadComments = thread.comments?.nodes || [];
      const hasMatchingBody = threadComments.some(tc =>
        tc.body === body || (tc.body && body && tc.body.includes(body.slice(0, 50)))
      );

      return lineMatch && hasMatchingBody;
    });

    if (activeThreadDuplicate) {
      console.log(`⏭️ Suppressing duplicate comment on ${path}:${line} (active GraphQL thread exists)`);
      continue;
    }

    filtered.push(comment);
  }

  return filtered;
}
