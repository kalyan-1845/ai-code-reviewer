# AI Code Reviewer - Project Learnings

## System Architecture & CI Gotchas

### 1. `backend/index.js` Timers
The backend contains module-level timers (e.g. `setInterval`) for cleanup tasks (CSRF tokens and ReviewQueue exclusive locks). If these are not `.unref()`'d, they will keep the Node event loop alive indefinitely. This causes integration tests to hang in CI if any test file imports `index.js`.
*Rule*: ALWAYS add `.unref()` to background timers in module scopes if the module might be imported by test runners.

### 2. Queue Concurrency & Race Conditions
The `ReviewQueue` must deduplicate Webhook payloads efficiently. Using a simple JS Map for deduplication fails under heavy concurrent load (e.g., mass automated PRs). 
*Rule*: Always use Redis for distributed locking and deduplication (`setnx`, `expire`, etc.) instead of in-memory maps for Webhook delivery IDs.

### 3. Webhook Body Limits
GitHub Webhook payloads can be very large. Express's default `bodyParser.json()` limit (e.g. 100kb) is insufficient.
*Rule*: Use a higher limit like `10mb` and implement `verifyWebhookSignature` correctly handling `utf-8` encoding.

### 4. Git Security
When cloning external repositories via RAG pipelines or webhook queues, malicious repositories can include custom git hooks.
*Rule*: Always pass `--config core.hooksPath=/dev/null` to `git.clone` to prevent Remote Code Execution (RCE) during automated clones.

### 5. API Pagination Limitations
External dashboards and trackers (like the GSSoC bot) rely on GitHub's REST or GraphQL APIs. These APIs have strict pagination limits (typically defaulting to 100 per page, capping at 500 nodes max in certain GraphQL connections unless specifically paginated).
*Rule*: If a third-party tracker is stuck at exactly 500, it is 100% a pagination implementation bug on their end, not a labels issue on our repository.
