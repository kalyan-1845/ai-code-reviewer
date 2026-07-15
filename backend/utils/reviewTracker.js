// Tracks the most recently posted review IDs per PR so that a subsequent
// `synchronize` webhook can supersede the prior review instead of leaving
// it in place alongside a brand new one — without this, every push to an
// open PR piles on another full duplicate review thread.
//
// Storage is Redis (already required by the webhook handler for delivery/SHA
// dedup), keyed by `webhook:lastReview:{owner}/{repo}/{pullNumber}`.

const REVIEW_TRACKER_PREFIX = 'webhook:lastReview:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — well beyond any realistic PR lifetime

export function reviewTrackerKey(owner, repo, pullNumber) {
  return `${REVIEW_TRACKER_PREFIX}${owner}/${repo}/#${pullNumber}`;
}

/**
 * Returns the array of review IDs stored for this PR from the last
 * successful post, or an empty array if none exist.
 */
export async function getPriorReviewIds(redisClient, owner, repo, pullNumber) {
  const raw = await redisClient.get(reviewTrackerKey(owner, repo, pullNumber));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`⚠️ Invalid JSON in review tracker for key ${reviewTrackerKey(owner, repo, pullNumber)}`);
    return [];
  }
}

/**
 * Persists the review IDs just posted for this PR, replacing whatever was
 * stored before.
 */
export async function storeReviewIds(redisClient, owner, repo, pullNumber, reviewIds, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = reviewTrackerKey(owner, repo, pullNumber);
  try {
    await redisClient.set(key, JSON.stringify(reviewIds), 'EX', ttlSeconds);
  } catch (err) {
    console.error(`⚠️ Failed to store review IDs for ${key}: ${err.message}`);
  }
}

/**
 * Clears the tracked review for this PR. Called on PR close/merge so a
 * later reopen doesn't try to supersede a review from a previous lifecycle.
 */
export async function clearReviewIds(redisClient, owner, repo, pullNumber) {
  await redisClient.del(reviewTrackerKey(owner, repo, pullNumber));
}

const SUPERSEDED_NOTE = '\n\n---\n⚠️ **Superseded** — a newer commit was pushed to this PR. See the latest review below for up-to-date findings.';

/**
 * Marks each prior review as superseded: deletes its individual inline
 * comments (the actual duplicated content) and edits the review body to
 * note that it's been replaced. GitHub's API has no "delete review"
 * operation once a review is submitted, so editing the body + removing its
 * comments is the closest equivalent to the update-in-place the issue asks
 * for. Best-effort: a comment or review that's already gone (e.g. deleted
 * manually) is skipped rather than failing the whole operation.
 */
export async function supersedePriorReviews(octokit, owner, repo, pullNumber, priorReviewIds) {
  for (const reviewId of priorReviewIds) {
    try {
      const { data: comments } = await octokit.rest.pulls.listCommentsForReview({
        owner,
        repo,
        pull_number: pullNumber,
        review_id: reviewId,
      });

      for (const comment of comments) {
        try {
          await octokit.rest.pulls.deleteReviewComment({ owner, repo, comment_id: comment.id });
        } catch (err) {
          console.warn(`⚠️ Could not delete superseded review comment ${comment.id}: ${err.message}`);
        }
      }

      const { data: review } = await octokit.rest.pulls.getReview({ owner, repo, pull_number: pullNumber, review_id: reviewId });
      await octokit.rest.pulls.updateReview({
        owner,
        repo,
        pull_number: pullNumber,
        review_id: reviewId,
        body: `${review.body || ''}${SUPERSEDED_NOTE}`,
      });
    } catch (err) {
      console.warn(`⚠️ Could not supersede prior review ${reviewId} on PR #${pullNumber}: ${err.message}`);
    }
  }
}
