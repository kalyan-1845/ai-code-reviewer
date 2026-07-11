import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reviewTrackerKey,
  getPriorReviewIds,
  storeReviewIds,
  clearReviewIds,
  supersedePriorReviews,
} from '../utils/reviewTracker.js';

// ---------------------------------------------------------------------------
// Minimal in-memory Redis stand-in, just the subset reviewTracker.js uses.
// ---------------------------------------------------------------------------
function makeFakeRedis() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async expire() {
      return 1;
    },
    async del(key) {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    },
  };
}

test('reviewTrackerKey builds a stable, namespaced key', () => {
  assert.equal(
    reviewTrackerKey('acme', 'widgets', 42),
    'webhook:lastReview:acme/widgets/#42'
  );
});

test('getPriorReviewIds returns [] when nothing stored', async () => {
  const redis = makeFakeRedis();
  const ids = await getPriorReviewIds(redis, 'acme', 'widgets', 1);
  assert.deepEqual(ids, []);
});

test('storeReviewIds then getPriorReviewIds round-trips the array', async () => {
  const redis = makeFakeRedis();
  await storeReviewIds(redis, 'acme', 'widgets', 1, [111, 222]);
  const ids = await getPriorReviewIds(redis, 'acme', 'widgets', 1);
  assert.deepEqual(ids, [111, 222]);
});

test('storeReviewIds overwrites whatever was stored before', async () => {
  const redis = makeFakeRedis();
  await storeReviewIds(redis, 'acme', 'widgets', 1, [111]);
  await storeReviewIds(redis, 'acme', 'widgets', 1, [222, 333]);
  const ids = await getPriorReviewIds(redis, 'acme', 'widgets', 1);
  assert.deepEqual(ids, [222, 333]);
});

test('getPriorReviewIds tolerates corrupted JSON by returning []', async () => {
  const redis = makeFakeRedis();
  redis.store.set(reviewTrackerKey('acme', 'widgets', 1), 'not-json{{{');
  const ids = await getPriorReviewIds(redis, 'acme', 'widgets', 1);
  assert.deepEqual(ids, []);
});

test('clearReviewIds removes the stored entry', async () => {
  const redis = makeFakeRedis();
  await storeReviewIds(redis, 'acme', 'widgets', 1, [111]);
  await clearReviewIds(redis, 'acme', 'widgets', 1);
  const ids = await getPriorReviewIds(redis, 'acme', 'widgets', 1);
  assert.deepEqual(ids, []);
});

test('different PR numbers on the same repo do not collide', async () => {
  const redis = makeFakeRedis();
  await storeReviewIds(redis, 'acme', 'widgets', 1, [111]);
  await storeReviewIds(redis, 'acme', 'widgets', 2, [222]);
  assert.deepEqual(await getPriorReviewIds(redis, 'acme', 'widgets', 1), [111]);
  assert.deepEqual(await getPriorReviewIds(redis, 'acme', 'widgets', 2), [222]);
});

// ---------------------------------------------------------------------------
// supersedePriorReviews — verifies it deletes old inline comments and edits
// the old review body, without touching reviews it wasn't told about.
// ---------------------------------------------------------------------------

function makeFakeOctokit({ commentsByReview = {}, reviewsById = {}, failDeleteCommentIds = new Set() } = {}) {
  const deletedCommentIds = [];
  const updatedReviews = [];

  return {
    deletedCommentIds,
    updatedReviews,
    rest: {
      pulls: {
        async listCommentsForReview({ review_id }) {
          return { data: commentsByReview[review_id] || [] };
        },
        async deleteReviewComment({ comment_id }) {
          if (failDeleteCommentIds.has(comment_id)) {
            throw new Error(`comment ${comment_id} already deleted`);
          }
          deletedCommentIds.push(comment_id);
        },
        async getReview({ review_id }) {
          return { data: reviewsById[review_id] || { body: '' } };
        },
        async updateReview({ review_id, body }) {
          updatedReviews.push({ review_id, body });
        },
      },
    },
  };
}

test('supersedePriorReviews deletes every comment on each prior review', async () => {
  const octokit = makeFakeOctokit({
    commentsByReview: {
      100: [{ id: 1 }, { id: 2 }],
      101: [{ id: 3 }],
    },
    reviewsById: {
      100: { body: 'Original review body A' },
      101: { body: 'Original review body B' },
    },
  });

  await supersedePriorReviews(octokit, 'acme', 'widgets', 7, [100, 101]);

  assert.deepEqual(octokit.deletedCommentIds.sort(), [1, 2, 3]);
});

test('supersedePriorReviews appends a superseded note to each old review body', async () => {
  const octokit = makeFakeOctokit({
    commentsByReview: { 100: [] },
    reviewsById: { 100: { body: 'Original review body' } },
  });

  await supersedePriorReviews(octokit, 'acme', 'widgets', 7, [100]);

  assert.equal(octokit.updatedReviews.length, 1);
  assert.match(octokit.updatedReviews[0].body, /^Original review body/);
  assert.match(octokit.updatedReviews[0].body, /Superseded/);
});

test('supersedePriorReviews is a no-op for an empty prior-ids list', async () => {
  const octokit = makeFakeOctokit();
  await supersedePriorReviews(octokit, 'acme', 'widgets', 7, []);
  assert.deepEqual(octokit.deletedCommentIds, []);
  assert.deepEqual(octokit.updatedReviews, []);
});

test('supersedePriorReviews continues past a comment that fails to delete', async () => {
  const octokit = makeFakeOctokit({
    commentsByReview: { 100: [{ id: 1 }, { id: 2 }] },
    reviewsById: { 100: { body: 'Original' } },
    failDeleteCommentIds: new Set([1]),
  });

  await supersedePriorReviews(octokit, 'acme', 'widgets', 7, [100]);

  // Comment 1 failed but comment 2 still got deleted, and the review body
  // still got updated — one bad comment shouldn't abort the whole operation.
  assert.deepEqual(octokit.deletedCommentIds, [2]);
  assert.equal(octokit.updatedReviews.length, 1);
});

test('supersedePriorReviews continues to the next review if one review id is entirely invalid', async () => {
  const octokit = makeFakeOctokit({
    commentsByReview: { 101: [{ id: 5 }] },
    reviewsById: { 101: { body: 'Second review' } },
  });
  // review 999 isn't in the fake data at all — listCommentsForReview will
  // just return [] for it (not throw), matching how a real 404 would be a
  // thrown error caught by the try/catch per-review-id.
  octokit.rest.pulls.listCommentsForReview = async ({ review_id }) => {
    if (review_id === 999) throw new Error('Not Found');
    return { data: [{ id: 5 }] };
  };

  await supersedePriorReviews(octokit, 'acme', 'widgets', 7, [999, 101]);

  assert.deepEqual(octokit.deletedCommentIds, [5]);
  assert.equal(octokit.updatedReviews.length, 1);
  assert.equal(octokit.updatedReviews[0].review_id, 101);
});
