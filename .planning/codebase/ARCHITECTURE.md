<!-- refreshed: Tue Jul 07 2026 -->
# Architecture

**Analysis Date:** Tue Jul 07 2026

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         🎨 Frontend (React + Vite)                         │
│                     `frontend/src/pages/Dashboard.tsx`                      │
│                        `frontend/src/layouts/`                              │
├────────────────────────┬──────────────────────┬────────────────────────────┤
│  Setup Console         │  File Navigator      │  Audit Results Panel       │
│  (repo URL, model,     │  (search, filter,    │  (bugs, security,          │
│   company, language)   │   expand/collapse)   │   optimization, styling)   │
└────────────────────────┴──────────────────────┴────────────────────────────┘
         │ POST /api/analyze      │ GET/POST /api/*        │
         ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ⚙️ Backend (Node.js + Express)                           │
│                          `backend/index.js`                                 │
│                                                                             │
│  Middleware: cors, cookieParser, csrfProtection, rateLimit, requireApiKey   │
│  Routes:                                                                    │
│    POST /api/analyze      - Clone repo, scan files, forward to AI engine   │
│    POST /api/analyze-file - Direct file analysis (VS Code extension)        │
│    POST /api/chat         - Session-bound AI chat with repo context         │
│    POST /api/webhook      - GitHub webhook → PR review                     │
│    POST /api/issues/create - Create GitHub issues from findings             │
│    GET  /api/analytics/trends - 30-day analytics time-series               │
│    GET  /api/review-history - Paginated review history                     │
│    POST /api/reports/html - Export HTML report                              │
│    POST /api/reports/pdf  - Export PDF report                               │
│    POST /api/cache/invalidate - Analysis cache invalidation                │
│    POST /api/rag/query    - Proxy to AI Engine RAG                         │
│    GET  /health           - Health check                                    │
└───────────┬─────────────────────────────────────────────────┬───────────────┘
            │ POST /analyze, /chat, /review-diff              │
            │ POST /api/rag/split, /api/rag/ingest             │
            ▼                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    🧠 AI Engine (Python + FastAPI)                          │
│                          `ai-engine/app.py`                                 │
│                                                                             │
│  Middleware: rate_limit, require_api_key, CORSMiddleware                    │
│  Routes:                                                                    │
│    POST /analyze           - Batched LLM code review + README generation    │
│    POST /chat              - Repository-grounded AI chat                    │
│    POST /review-diff       - PR diff inline review                          │
│    POST /api/rag/split     - Split files into chunks for RAG               │
│    POST /api/rag/ingest    - Upsert chunks into ChromaDB                    │
│    POST /api/rag/query     - Semantic search over code chunks               │
│    POST /api/rag/chunks    - Paginated chunk listing                        │
│    POST /api/rag/cleanup   - Remove stale chunks                            │
│    POST /api/rag/delete-vectors - Delete specific file chunks               │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ Groq Chat Completions API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ☁️ Groq Cloud (External LLM)                            │
│       Models: llama-3.3-70b-versatile, deepseek-r1-distill-llama-70b,       │
│               llama-3.1-8b-instant, gemma2-9b-it                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Frontend Dashboard | UI for repo analysis, file browser, results, chat, analytics | `frontend/src/pages/Dashboard.tsx` |
| Backend API | REST API serving all client requests, repo cloning, security scanning | `backend/index.js` |
| AI Engine | LLM orchestration, RAG pipeline, prompt management, content sanitization | `ai-engine/app.py` |
| GitHub Action | Standalone PR reviewer that runs in GitHub Actions CI | `github-action/index.js` |
| VS Code Extension | IDE integration for file-level code review | `vscode-extension/src/extension.ts` |
| Chrome DB Vector Store | Semantic code search for RAG chat | `ai-engine/rag.py` |
| Session Manager | MongoDB-backed chat session persistence with TTL | `backend/models/Session.js` |
| Analytics Engine | Review history and trends (MongoDB + file fallback) | `backend/models/Analytics.js` |

## Pattern Overview

**Overall:** Modular monorepo with independent deployable modules

**Key Characteristics:**
- Each module has its own package.json/requirements.txt and can run independently
- Backend acts as the orchestrator — frontend and GitHub Action talk to backend, backend talks to AI Engine
- AI Engine is the sole LLM interface (except for GitHub Action which calls Groq directly)
- Shared safety config (`shared-safety-config.json`) loaded by both backend and AI Engine for prompt injection defense
- RAG pipeline is split-splitter → embed → ingest → query, managed across backend proxy + AI Engine

## Layers

**Frontend Layer:**
- Purpose: User interface for repository analysis, results visualization, and AI chat
- Location: `frontend/src/`
- Contains: `Dashboard.tsx` (main page), `SidebarLayout.tsx`, components (`HealthScoreGauge`, `MetricsChart`, etc.), `store/useStore.ts` (Zustand state), `utils/api.ts` (API client)
- Depends on: Backend API via `apiFetch` helper
- State: Zustand store + localStorage for persistence

**Backend Layer:**
- Purpose: HTTP API gateway, repository cloning, security scanning, complexity analysis, report generation
- Location: `backend/`
- Contains: `index.js` (all routes), `config/db.js` (MongoDB), `utils/` (23 utility modules), `models/` (Mongoose schemas)
- Depends on: AI Engine (HTTP), MongoDB, Redis (optional), GitHub API (Octokit)
- Key middleware: `requireApiKey`, `csrfProtection`, rate limiters, body parsers

**AI Engine Layer:**
- Purpose: LLM inference, prompt engineering, RAG pipeline, content sanitization
- Location: `ai-engine/`
- Contains: `app.py` (FastAPI routes), `embeddings.py`, `rag.py` (ChromaDB operations), `text_splitter.py`, `diff_helper.py`
- Depends on: Groq API, ChromaDB, Sentence Transformers (optional, deterministic fallback)
- Patterns: Async endpoint handlers, thread-pool LLM calls with timeout, batch processing

**RAG Layer:**
- Purpose: Vector-based semantic code search
- Components:
  - `ai-engine/text_splitter.py` - LangChain-based language-aware chunking
  - `ai-engine/embeddings.py` - SentenceTransformer with deterministic hash fallback
  - `ai-engine/rag.py` - ChromaDB CRUD operations with per-repo collection isolation
  - `chromadb` - Vector database (Docker or persistent local)

## Data Flow

### Primary Request Path (Full Repository Analysis)

1. **User submits repo URL** via Frontend (`Dashboard.tsx:1040`, `handleAnalyze`)
2. **Frontend calls** `POST /api/analyze` via `apiFetch` with session+CSRF auth
3. **Backend validates input** (`index.js:554`): repo URL format, model whitelist, system prompt injection check, repo size check via GitHub API
4. **Backend clones repo** via `simple-git` with depth=1, blob-limit filter (`index.js:624`)
5. **Backend reads files** via `readFilesRecursively` (`utils/ignoreHelper.js`), applying `.reposageignore` patterns
6. **Backend scans for prompt injection** in file content (`utils/sanitizeFileContent.js:scanFileContentForWarnings`)
7. **Backend checks analysis cache** (`utils/analysisCache.js`) - returns cached result if valid
8. **Backend forwards files** to AI Engine `POST /analyze` (`index.js:675`)
9. **AI Engine batches files** by `batchSize`, sends each batch to Groq LLM with structured JSON prompt (`app.py:462-627`)
10. **AI Engine merges batch results** with deduplication, sanitizes outputs via `bleach`
11. **Backend injects secrets scan** results and complexity metrics (`index.js:697-718`)
12. **Backend persists session** to MongoDB for chat (`index.js:724-755`)
13. **Backend triggers RAG ingestion** via `/api/rag/split` + `/api/rag/ingest` (`index.js:758-822`)
14. **Backend persists analytics** to MongoDB (`index.js:897-923`)
15. **Results returned** to frontend with file reviews, health score, README, mermaid diagram

### Webhook PR Review Flow

1. **GitHub sends webhook** to `POST /api/webhook`
2. **Backend verifies HMAC-SHA256** signature (`utils/signatureVerifier.js`)
3. **Delivery dedup check** via Redis SETNX or in-memory set (`index.js:1297-1308`)
4. **SHA dedup check** to avoid re-reviewing same commit (`index.js:1320-1329`)
5. **Per-repo rate limit check** (`index.js:1337-1350`)
6. **Enqueue review** in `ReviewQueue` per-key mutex (`utils/reviewQueue.js`)
7. **Fetch PR diff** via Octokit, parse via `utils/diffParser.js` (`index.js:1468-1496`)
8. **Per-file loop**: run secrets scanner, forward diffs to AI Engine `/review-diff`
9. **Post inline review comments** to GitHub PR via `octokit.rest.pulls.createReview`
10. **Auto-approve** if zero findings (if configured)

### Chat Flow

1. **User sends message** in frontend chat panel (`Dashboard.tsx:848`)
2. **Frontend calls** `POST /api/chat` with `sessionId`, message, history
3. **Backend acquires exclusive lock** per session (`utils/reviewQueue.js:runExclusive`) to prevent race conditions
4. **Backend loads session context** from MongoDB (`Session.findOne`)
5. **Ownership check** via `ownerToken` (IDOR prevention, issue #742)
6. **Backend forwards to AI Engine** `POST /chat` with files, message, history
7. **AI Engine scores files** by keyword relevance to question, selects top 20 (`app.py:670-681`)
8. **Optionally queries RAG** for additional context (`app.py:702-724`)
9. **Sends to Groq** with system prompt + file context + chat history
10. **Response returned** through backend to frontend

## State Management

- **Frontend:** Zustand store (`frontend/src/store/useStore.ts`) for analysis results, selected file, chat history
- **Chat sessions:** MongoDB `sessions` collection with TTL index (24h sliding window)
- **Analytics:** MongoDB `analytics` collection + file-based fallback
- **Analysis cache:** In-memory Map with SHA256-based keys, sliding TTL, LRU eviction
- **Rate limiting:** Express middleware + optional Redis store, in-memory per-repo maps
- **CSRF tokens:** In-memory Map with rotation and grace period

## Key Abstractions

**AnalysisCache (`backend/utils/analysisCache.js`):**
- Purpose: Cache analysis results keyed by SHA256 hash of inputs
- Features: Sliding TTL, absolute max TTL, LRU eviction, thundering herd prevention via per-key AsyncLock
- Stats tracking: hits, misses, evictions, dedupSaves

**ReviewQueue (`backend/utils/reviewQueue.js`):**
- Purpose: Per-key serialized async execution for webhook reviews and chat sessions
- Features: Max queues limit, per-queue max items, retry with exponential backoff, stale lock cleanup
- Two modes: `enqueue` (FIFO queue per key) and `runExclusive` (serialized chaining)

**Secrets Scanner (`backend/utils/secretsScanner.js`):**
- Purpose: Regex-based static secret detection
- Features: 15 rules (AWS keys, GitHub tokens, Stripe keys, GCP keys, DB creds, etc.), line-level scanning, timeout protection, configured max line lengths

**Embeddings (`ai-engine/embeddings.py`):**
- Purpose: Text-to-vector conversion for RAG
- Two modes: SentenceTransformer (real) / Deterministic blake2b hash (fallback)
- Caching: LRU cache of computed embeddings

**Prompt Injection Defenses:**
- Shared config: `shared-safety-config.json` with dangerous phrases and homoglyph map
- Backend: `validatePrompt()` with NFKC normalization, homoglyph detection, dangerous regex matching
- AI Engine: `sanitize_file_content()` with pattern neutralization, `validate_system_prompt()` with script detection
- Output sanitization: `bleach` HTML sanitization, `sanitize_mermaid_code()`, `sanitize_ai_output()`

## Anti-Patterns

### Monolithic Backend Routes

**What happens:** All Express routes (analyze, webhook, chat, reports, cache, health) are defined in a single 2200-line `backend/index.js` file with inline middleware, helpers, and business logic.
**Why it's wrong:** Makes the file hard to navigate, test in isolation, or modify without side effects. Route handlers contain inline utility functions (`fetchWithTimeout`, `generateDependencyReport`, `validatePrompt`, etc.) that could be extracted.
**Do this instead:** Use Express Router to split into `routes/analyze.js`, `routes/webhook.js`, `routes/chat.js`, etc.

### In-Memory State Across Instances

**What happens:** CSRF token store, analysis cache, review queue, rate limit maps, and webhook dedup all use in-memory Maps that don't survive server restart and don't work across multiple instances.
**Why it's wrong:** Horizontal scaling requires session affinity or shared state. CSRF tokens generated by one instance are rejected by another.
**Do this instead:** Migrate analysis cache to Redis, CSRF store to Redis, rate limiting to Redis-backed store (partially done with `rate-limit-redis`).

### Hardcoded API Keys in Code

**What happens:** `backend/index.js` line 43 creates Octokit with `process.env.GITHUB_PAT`. The `auto_github.js` script checks for placeholder tokens (`your_github_personal_access_token_here`). The `.env.example` files contain placeholder values.
**Why it's wrong:** While not hardcoded in source, the pattern of loading tokens from env vars into global scope at module load time risks accidental exposure in error messages and logs.
**Do this instead:** Use the Settings pattern described in `IMPLEMENTATION_785.md` with a config class that masks secrets in serialization.

### any Type Catch Clauses

**What happens:** Frontend `Dashboard.tsx` catch clauses use `err: unknown` (good) but the document stores `analysisResult` as `BackendResponse | null` with many `any` pattern uses in intermediate state. `App.tsx:58` has a TODO for this.
**Do this instead:** Use type guards and proper error types consistently (noted in issue #1291).

## Error Handling

**Strategy:** Express middleware-based error handler at `backend/index.js:2169` catches all unhandled errors. In production, stack traces are hidden. Rate limiters return structured JSON errors. Process-level handlers for `unhandledRejection` and `uncaughtException`.

**Patterns:**
- Express async errors via `express-async-errors` import at top of `index.js`
- AI Engine raises `HTTPException` with status codes (400, 401, 422, 500, 502, 504)
- Graceful degradation: MongoDB failure → file-based analytics, AI Engine failure → mock reviews
- Webhook errors logged but don't fail the HTTP response (fire-and-forget via queue)

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` throughout; no structured logging library
**Validation:** Pydantic models on AI Engine, manual validation on backend (type checks, length limits, regex patterns, boundary enforcement)
**Authentication:** API key (x-api-key) + session cookie (rps_v1_session) + CSRF token two-layer
**Rate Limiting:** Per-IP (express-rate-limit), per-repo (in-memory Map), AI Engine (in-memory sliding window)
**Security Scanning:** Regex-based secret detection, prompt injection detection and neutralization, XSS sanitization (bleach + dompurify), file path traversal prevention

---

*Architecture analysis: Tue Jul 07 2026*
