import crypto from 'crypto';
import DedupStore from '../utils/dedupStore.js';

// Default TTL configurations
const DEFAULT_PROCESSING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_COMPLETED_TTL_MS = 30 * 60 * 1000;  // 30 minutes

/**
 * Computes a deterministic SHA256 composite idempotency key based on request payload parameters.
 * Format: sha256(repo_url + commit_sha + pr_number)
 *
 * @param {import('express').Request} req
 * @returns {string} Idempotency key string prefixed with 'idempotency:'
 */
export function generateIdempotencyKey(req) {
  const body = req.body || {};

  // Custom client header takes highest precedence if provided
  const customKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];
  if (customKey && typeof customKey === 'string' && customKey.trim()) {
    const customHash = crypto.createHash('sha256').update(customKey.trim()).digest('hex');
    return `idempotency:custom:${customHash}`;
  }

  // Extract repo_url
  const repoUrl = (
    body.repoUrl ||
    body.repo_url ||
    body.repository?.html_url ||
    body.repository?.clone_url ||
    body.repo ||
    ''
  ).toString().toLowerCase().trim();

  // Extract commit_sha
  const commitSha = (
    body.commitSha ||
    body.commit_sha ||
    body.head_commit?.id ||
    body.pull_request?.head?.sha ||
    body.sha ||
    req.headers['x-github-delivery'] ||
    ''
  ).toString().trim();

  // Extract pr_number
  const prNumber = (
    body.prNumber ??
    body.pr_number ??
    body.pull_request?.number ??
    body.number ??
    '0'
  ).toString().trim();

  if (repoUrl || commitSha || prNumber !== '0') {
    const rawKey = `${repoUrl}|${commitSha}|${prNumber}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    return `idempotency:${hash}`;
  }

  // Fallback for generic payloads without identifying repo/commit fields
  const fallbackRaw = `${req.originalUrl || req.url}|${JSON.stringify(body)}`;
  const hash = crypto.createHash('sha256').update(fallbackRaw).digest('hex');
  return `idempotency:generic:${hash}`;
}

/**
 * Factory function to create an Express idempotency middleware.
 *
 * @param {Object} [options]
 * @param {DedupStore} [options.store] Backing store instance
 * @param {Object} [options.redisClient] Redis client instance (if store not passed)
 * @param {number} [options.processingTtlMs] TTL for lock while request is PROCESSING
 * @param {number} [options.completedTtlMs] TTL for lock after request is COMPLETED
 * @returns {import('express').RequestHandler}
 */
export function createIdempotencyMiddleware(options = {}) {
  const store = options.store || new DedupStore(options.redisClient);
  const processingTtlMs = options.processingTtlMs || DEFAULT_PROCESSING_TTL_MS;
  const completedTtlMs = options.completedTtlMs || DEFAULT_COMPLETED_TTL_MS;

  return async function idempotencyMiddleware(req, res, next) {
    // Only intercept state-changing HTTP methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    try {
      const key = generateIdempotencyKey(req);
      const existingRaw = await store.get(key);

      let existingData = null;
      if (existingRaw) {
        try {
          existingData = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw;
        } catch {
          existingData = { status: existingRaw };
        }
      }

      if (existingData) {
        if (existingData.status === 'PROCESSING') {
          return res.status(202).json({
            status: 'PROCESSING',
            message: 'Job already in execution pipeline',
            jobId: existingData.jobId || null,
          });
        }

        if (existingData.status === 'COMPLETED') {
          if (existingData.response) {
            return res.status(existingData.response.statusCode || 200).json(existingData.response.body);
          }
          return res.status(202).json({
            status: 'COMPLETED',
            message: 'Job already processed',
            jobId: existingData.jobId || null,
          });
        }
      }

      // Claim the lock with status PROCESSING
      const jobId = crypto.randomUUID();
      const lockData = {
        status: 'PROCESSING',
        jobId,
        createdAt: Date.now(),
      };

      await store.set(key, JSON.stringify(lockData), processingTtlMs);

      req.idempotencyKey = key;
      req.jobId = jobId;

      // Intercept response to update state to COMPLETED on success, or delete on error
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        if (res.statusCode < 400) {
          const completedData = {
            status: 'COMPLETED',
            jobId,
            completedAt: Date.now(),
            response: {
              statusCode: res.statusCode,
              body,
            },
          };
          store.set(key, JSON.stringify(completedData), completedTtlMs).catch((err) => {
            console.warn('[Idempotency] Failed to update completed status:', err.message);
          });
        } else {
          // On HTTP error status (4xx, 5xx), release lock so retries are permitted
          store.delete(key).catch((err) => {
            console.warn('[Idempotency] Failed to release lock on error:', err.message);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('[Idempotency] Middleware error:', err);
      next();
    }
  };
}

export const idempotencyMiddleware = createIdempotencyMiddleware();
