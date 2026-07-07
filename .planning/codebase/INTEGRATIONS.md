# External Integrations

**Analysis Date:** Tue Jul 07 2026

## APIs & External Services

**LLM Provider:**
- **Groq Cloud** - Core AI inference provider for code review, chat, README generation, and PR review analysis
  - SDK/Client: `groq` (Python) / `groq-sdk` (JS) / `@groq-sdk` (GitHub Action)
  - Auth: `GROQ_API_KEY` env var
  - Models used: `llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`, `llama-3.1-8b-instant`, `gemma2-9b-it`
  - Endpoints: Chat completions API with `response_format: json_object`

**GitHub API:**
- **Octokit REST** - Repository metadata, PR diff fetching, issue creation, PR review posting, label management
  - SDK: `@octokit/rest@^22.0.1` (backend), `@actions/github@^6.0.0` (GitHub Action)
  - Auth: `GITHUB_PAT` (backend) / `secrets.GITHUB_TOKEN` (GitHub Action)
  - Key operations: `repos.get`, `pulls.get`, `pulls.createReview`, `issues.create`, `issues.addLabels`, `issues.listComments`
  - Diff format: `mediaType: { format: 'diff' }` for raw PR diffs

## Data Storage

**Databases:**
- **MongoDB** - Primary persistence layer
  - Connection: `MONGODB_URI` env var (default: `mongodb://localhost:27017/reposage`)
  - Client: `mongoose@^9.7.1`
  - Collections: `analytics` (review history, trends), `sessions` (chat session context with TTL expiry)
  - Degraded mode: Backend runs without MongoDB if unavailable (file-based analytics fallback)
  - TTL indexes: `sessions.absoluteExpiry` with `expireAfterSeconds: 0` for automatic cleanup

- **ChromaDB** - Vector database for RAG pipeline
  - Connection: HTTP client (`chromadb.HttpClient`) or persistent local (`chromadb.PersistentClient`)
  - Host/Port: `CHROMA_HOST` / `CHROMA_PORT` env vars (default: `chromadb:8000`)
  - Collection: `reposage_code_chunks` (per-repo namespaced via SHA256 hash suffix)
  - Docker service: `chromadb/chroma:latest` on port 8001 mapped to 8000
  - Persistence: `chroma_data` Docker volume

**Caching:**
- **Redis** (optional) - Distributed rate limiting and webhook deduplication
  - Connection: `REDIS_URL` env var
  - Client: `ioredis@^5.3.2`
  - Usage: `SETNX` for webhook delivery dedup, `RedisStore` for express-rate-limit
  - In-memory fallback: Maps with TTL sweeper when Redis unavailable

- **In-memory Analysis Cache** - LRU cache with sliding TTL for analysis results
  - Max entries: 1000
  - Default TTL: 60 minutes
  - Uses SHA256 file hashing for change detection

**File-based Analytics:**
- File: `backend/analytics_trends.json` with `.backup` and atomic `.tmp` writes
- Lock mechanism: Promise-chain based async lock with exponential backoff

## Authentication & Identity

**Auth Provider:**
- **Custom API Key + Session Cookie** - Two-layer auth
  - API Key: `x-api-key` header validated against `REPOSAGE_API_KEY`
  - Session Cookie: HMAC-signed cookie (`rps_v1_session`) with `uid` for client identity
  - Session secret: `SESSION_SECRET` (must differ from `REPOSAGE_API_KEY`)
  - Key validation: Constant-time comparison via `crypto.timingSafeEqual`

- **CSRF Protection:**
  - Double-submit cookie pattern with `X-CSRF-Token` header
  - Token rotation on each state-changing request with grace period for concurrent requests
  - In-memory token store (Map) - not shared across instances

## Monitoring & Observability

**Error Tracking:**
- None (console.error-based logging only)

**Logs:**
- `console.log`/`console.error` throughout all modules
- No structured logging library (no Winston, Pino, etc.)
- AI Engine startup logs env loading status, model init status

## CI/CD & Deployment

**Hosting:**
- **Render.com** - Backend and AI Engine (via `render.yaml`)
  - Backend: Node service, `cd backend && npm start`
  - AI Engine: Python service via `uvicorn app:app`
- **Vercel** - Frontend (via `frontend/vercel.json`)
- **Docker** - Local development via `docker-compose.yml`

**CI Pipeline:**
- **GitHub Actions** - `.github/workflows/ci.yml`
  - Jobs: `build-frontend`, `build-github-action`, `check-backend`
  - Backend tests with MongoDB service container
  - AI Engine tests with coverage (continue-on-error)
  - Codecov upload for lcov and XML reports

## Environment Configuration

**Required env vars (all modules):**
- `GROQ_API_KEY` - Groq API key for LLM inference
- `REPOSAGE_API_KEY` - Shared secret for inter-module auth
- `GITHUB_PAT` - GitHub personal access token
- `WEBHOOK_SECRET` - GitHub webhook secret

**Backend-specific:**
- `PORT` (default: 5000), `AI_ENGINE_URL` (default: http://localhost:8000)
- `ALLOWED_ORIGINS` (default: localhost:3000,localhost:5173)
- `MONGODB_URI`, `SESSION_SECRET`, `REDIS_URL`
- `GIT_CLONE_TIMEOUT` (default: 120000ms), `MAX_REPO_SIZE_MB` (default: 100)
- `JSON_BODY_LIMIT` (default: 5mb), `ANALYSIS_CACHE_TTL_MINUTES` (default: 60)
- `TRUST_PROXY` (default: true)

**AI Engine-specific:**
- `PORT` (default: 8000), `UVICORN_RELOAD`
- `LLM_TIMEOUT_SECONDS` (default: 30)
- `MAX_FILE_CHARS_PER_FILE` (default: 1500), `MAX_CHAT_FILES` (default: 20)
- `CHROMA_HOST`, `CHROMA_PORT`, `CHROMA_COLLECTION`
- `TEXT_CHUNK_SIZE` (default: 1000), `TEXT_CHUNK_OVERLAP` (default: 200)

**Frontend-specific:**
- `VITE_API_URL` (default: http://localhost:5000) - **CRITICAL**: never put REPOSAGE_API_KEY here (Vite inlines VITE_ prefixed vars into the client bundle)

## Webhooks & Callbacks

**Incoming:**
- **GitHub Webhook** - `POST /api/webhook` on the backend
  - Supported events: `pull_request` (opened/synchronize), `push`, `ping`
  - HMAC-SHA256 signature verification via `x-hub-signature-256` header
  - Delivery deduplication via `x-github-delivery` UUID (Redis or in-memory)
  - Per-repository rate limiting (5 requests/min per repo)
  - Triggers: PR review via AI Engine, cache invalidation on push

**Outgoing:**
- **GitHub Checks API** - PR review comments via `octokit.rest.pulls.createReview`
  - Batched at 50 comments per review (GitHub API limit)
  - Auto-approves PRs with zero findings (adds `gssoc:approved` label)

---

*Integration audit: Tue Jul 07 2026*
