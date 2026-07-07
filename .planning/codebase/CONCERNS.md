# Codebase Concerns

**Analysis Date:** Tue Jul 07 2026

## Tech Debt

### Monolithic Backend Server (`backend/index.js`)
- **Issue:** All 15+ API routes, inline middleware, in-memory state stores, and business logic are crammed into a single ~2203-line file
- **Files:** `backend/index.js`
- **Impact:** Hard to navigate, test in isolation, or modify without side effects. inline utilities (`fetchWithTimeout`, `generateDependencyReport`, `validatePrompt`) should be extracted
- **Fix approach:** Extract routes into `backend/routes/` directory using Express Router; extract inline helpers into `backend/utils/`

### Monolithic AI Engine (`ai-engine/app.py`)
- **Issue:** All FastAPI routes are in a single ~1037-line file; also includes data models, middleware, and inline helpers
- **Files:** `ai-engine/app.py`
- **Impact:** Same as backend — difficult to maintain and test independently
- **Fix approach:** Split into `routes/analyze.py`, `routes/rag.py`, `routes/chat.py`, `models.py`

### In-Memory CSRF Token Store
- **Issue:** CSRF tokens are stored in a Map that doesn't survive server restart or work across multiple backend instances
- **Files:** `backend/index.js` lines 175-210
- **Impact:** Production multi-instance deployments break CSRF validation — tokens from one instance are rejected by another
- **Fix approach:** Migrate CSRF store to Redis (similar to rate-limit-redis pattern)

### In-Memory Analysis Cache
- **Issue:** AnalysisCache (`backend/utils/analysisCache.js`) uses an in-memory Map with LRU eviction
- **Files:** `backend/utils/analysisCache.js` — has explicit TODO on line 9
- **Impact:** Cache doesn't survive restart, doesn't scale horizontally
- **Fix approach:** Migrate to Redis-backed cache (as noted in the code's own TODO comment)

### In-Memory Webhook Dedup
- **Issue:** Webhook deduplication falls back to in-memory Set/Map when Redis is unavailable
- **Files:** `backend/index.js` lines 466-498
- **Impact:** Unbounded memory growth risk (mitigated by TTL sweeper but not in Redis)
- **Fix approach:** Make Redis required for production deployments

### No Structured Logging
- **Issue:** All modules use raw `console.log`/`console.error` with no structured logging library
- **Files:** All modules across the codebase
- **Impact:** No log levels, no structured JSON output, no ability to route logs to centralized systems
- **Fix approach:** Add a logging library (Winston, Pino, or Python logging) with structured format

## Known Bugs

### Temp Folder Leakage on Crash (Issue #397)
- **Symptoms:** If the Node process crashes during analysis, the cloned repository in `temp_repos/` is never cleaned up
- **Files:** `backend/index.js` line 2203 (TODO comment)
- **Trigger:** Process crash (SIGKILL, uncaught exception) during `POST /api/analyze`
- **Workaround:** Manual cleanup of `backend/temp_repos/`
- **Fix approach:** Use `tmp` package with process-level cleanup or move to temp OS directory

### validate_system_prompt Fails to Strip Multiple Occurrences (Issue #395)
- **Symptoms:** The `validate_system_prompt` function only strips the first match of dangerous phrases in some scenarios
- **Files:** `ai-engine/app.py` line 1037 (TODO comment); `backend/index.js` `validatePrompt` at line 526
- **Trigger:** System prompts containing multiple dangerous phrases
- **Workaround:** Single dangerous phrase per prompt is caught; multiple may bypass
- **Fix approach:** Loop the sanitization until no more dangerous patterns remain (addresses the TODO)

## Security Considerations

### API Key Logging Risk (Issue #785)
- **Risk:** API keys and sensitive data could inadvertently appear in logs, error messages, and stack traces
- **Files:** Cross-cutting concern — `backend/index.js`, `ai-engine/app.py`
- **Current mitigation:** `ai-engine/app.py` has `_redact_key()` function that replaces API key subsequences with `***`. Backend console.error sometimes includes raw error messages that may contain keys
- **Recommendations:** Implement the structured config class described in `IMPLEMENTATION_785.md` with custom serialization that masks secrets; audit all `console.*` calls for potential leakage

### IDOR in Chat Sessions (Issue #787)
- **Risk:** Insecure Direct Object Reference — one user could access another user's chat session
- **Files:** `backend/index.js` lines 1131-1138 (session ownership verification)
- **Current mitigation:** `ownerToken` field on session documents verified inside exclusive lock. Fix implemented per `IMPLEMENTATION_787.md`
- **Recommendations:** Verify the fix covers all session-accessing endpoints

### Prompt Injection
- **Risk:** Malicious users could craft system prompts or file contents that override LLM instructions
- **Files:** `backend/index.js` (validatePrompt), `ai-engine/app.py` (validate_system_prompt, sanitize_file_content), `backend/shared/dangerousPhrases.js`, `shared-safety-config.json`
- **Current mitigation:** Multi-layer defense: NFKC normalization, homoglyph detection, dangerous phrase regex matching, content wrapping with `BEGIN/END FILE CONTENT` markers, output sanitization via `bleach`
- **Recommendations:** Regularly update `DANGEROUS_PHRASES` in `shared-safety-config.json` as new injection techniques emerge

### XSS in Report Generation
- **Risk:** HTML report generation uses inline strings with `escapeHtml()` for user-controlled content
- **Files:** `backend/index.js` (HTML report: lines 1695-1836)
- **Current mitigation:** `lodash.escape` used for all interpolation, but the HTML is constructed via string concatenation which is error-prone
- **Recommendations:** Use a template engine with auto-escaping (EJS, Handlebars) or a markdown-to-HTML library

## Performance Bottlenecks

### Synchronous File Reading in Request Handler
- **Problem:** `readFilesRecursively` (`backend/utils/ignoreHelper.js`) uses `fs.readFileSync` inside the `/api/analyze` request handler, blocking the event loop
- **Files:** `backend/utils/ignoreHelper.js` line 137
- **Cause:** `fs.readdirSync`, `fs.lstatSync`, `fs.statSync`, `fs.readFileSync` all block the Node.js event loop
- **Improvement path:** Use `fs.promises` API with Promise.all for concurrent file reads

### Single-Threaded Groq API Calls
- **Problem:** AI Engine's `_call_groq_with_timeout` runs synchronous Groq SDK calls in a thread pool executor, but processes batches sequentially
- **Files:** `ai-engine/app.py` line 238-253
- **Cause:** Each batch of files waits for the previous batch's LLM response before sending the next
- **Improvement path:** Process batches concurrently with a configurable concurrency limit

### Large Repository Analysis
- **Problem:** Full repository cloning and analysis can take minutes for large repos
- **Files:** `backend/index.js` lines 621-637 (clone), lines 642-693 (read + analyze)
- **Cause:** Sequential clone → read → analyze pipeline with no streaming
- **Improvement path:** Add streaming analysis (analyze files as they're cloned), incremental analysis for previously seen files

## Fragile Areas

### Webhook Review Flow
- **Files:** `backend/index.js` `runWebhookReview` function (lines 1460-1667)
- **Why fragile:** 12+ GitHub API calls, multiple failure points (diff fetch, AI Engine query, review posting), batching logic (50 comments per batch), stale SHA detection, label management
- **Safe modification:** Add integration tests with a test GitHub repo; add more granular error handling per step
- **Test coverage:** `tests/webhook.test.js` covers the webhook endpoint logic, but end-to-end webhook review is hard to test

### Secrets Scanner Regex
- **Files:** `backend/utils/secretsScanner.js` (15 regex rules)
- **Why fragile:** Regex patterns can have false positives (legitimate code matching secret patterns) and false negatives (new secret formats not covered)
- **Safe modification:** Add tests for each new rule; always test against known false positive cases
- **Test coverage:** 6+ test files cover secrets scanning extensively

## Dependencies at Risk

### chromadb (Python)
- **Risk:** Version pinned to 1.5.9; may have compatibility issues with newer Python or dependency versions
- **Impact:** RAG pipeline entirely depends on ChromaDB — if it breaks, semantic search is unavailable
- **Migration plan:** Abstract ChromaDB behind an interface to allow alternative vector stores (Pinecone, Qdrant, Weaviate)

### groq / groq-sdk
- **Risk:** Single cloud provider dependency with rate limits and pricing changes
- **Impact:** All AI features depend on Groq availability — no fallback LLM provider exists
- **Migration plan:** Abstract LLM calls behind an interface (already partially done via mock fallback); add support for OpenAI, Anthropic, or local models (Ollama)

## Missing Critical Features

### No Rate Limiting on AI Engine `POST /analyze`
- **Problem:** The `/analyze` endpoint has no hard per-client rate limit (only a global 500/min per-IP limit)
- **Files:** `ai-engine/app.py` lines 283-308
- **Impact:** An attacker could exhaust Groq API quota by submitting many analysis requests
- **Priority:** Medium

### No Graceful Shutdown for Analysis Cache Sweeper
- **Problem:** The `_startSweeper` interval in `AnalysisCache` uses `setInterval` but `_stopSweeper` is only called by `clear()` which isn't invoked on shutdown
- **Files:** `backend/utils/analysisCache.js` lines 203-228
- **Impact:** Minor — sweeper timer keeps process alive if not unref'd; currently calls `.unref()` so it doesn't prevent exit

## Test Coverage Gaps

**Backend Integration Tests:**
- What's not tested: End-to-end `/api/analyze` flow (clone + scan + AI Engine call)
- Files: No integration test for the full pipeline
- Risk: Refactoring the main `index.js` could break the analysis flow without detection
- Priority: High

**AI Engine Tests:**
- What's not tested: LLM-dependent endpoints (`/analyze`, `/chat`, `/review-diff`)
- Files: `ai-engine/tests/` — CI runs pytest with `continue-on-error: true`
- Risk: AI Engine code changes are not validated in CI
- Priority: High

**Frontend Tests:**
- What's not tested: Main `Dashboard.tsx` component (no component-level tests)
- Files: Only `useStore.test.js`, `exportUtils.test.js`, `sanitize.test.js`, `useDebounce.test.tsx`
- Risk: UI regressions go undetected
- Priority: Medium

---

*Concerns audit: Tue Jul 07 2026*
