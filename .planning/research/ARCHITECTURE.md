# Architecture Research: RepoSage

## High-Level Architecture

RepoSage follows a **three-tier architecture** with an independent GitHub Action and an emerging VS Code extension:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React 19)                         │
│  Port 3000 · Vite 8 · TypeScript 6 · zustand · recharts            │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐       │
│  │Dashboard│ │Analytics │ │Settings  │ │Components (11+)   │       │
│  │  Page   │ │  Charts  │ │  Modal   │ │HealthScore, KPI,  │       │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ │Charts, etc.      │       │
│       │           │            │        └──────────────────┘       │
│       └───────────┴────────────┴──────────────────────┐            │
│                              HTTP REST (fetch)        │            │
└──────────────────────────────────────────────────────┼─────────────┘
                                                       │
┌──────────────────────────────────────────────────────┼─────────────┐
│                         Backend (Express 4)          │             │
│  Port 5000 · ESM · Mongoose 9 · simple-git · Redis  ▼             │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  REST    │  │  Auth/Sec    │  │  Cache       │  │ Analytics │  │
│  │  Routes  │  │  Middleware   │  │  (LRU+Redis) │  │  (Mongo)  │  │
│  ├──────────┤  ├──────────────┤  ├──────────────┤  ├───────────┤  │
│  │/api/     │  │· CSRF Tokens │  │· Analysis    │  │· Trends   │  │
│  │ analyze  │  │· Session Mgmt│  │  Cache (TTL) │  │· History  │  │
│  │/api/chat │  │· Rate Limits │  │· Webhook     │  │· Compare  │  │
│  │/api/     │  │· API Key Auth│  │  Dedup       │  │           │  │
│  │ webhook  │  │· Prompt Inj. │  └──────┬───────┘  └───────────┘  │
│  │/api/     │  │  Detection   │         │                          │
│  │ reports  │  └──────────────┘         │ (optional Redis)         │
│  └────┬─────┘                           ▼                          │
│       │                        ┌──────────────┐                    │
│       │                        │   MongoDB    │                    │
│       │                        │  (Sessions,  │                    │
│       │                        │  Analytics)  │                    │
│       │                        └──────────────┘                    │
│       │                                                           │
│       │  HTTP Proxy (fetch)                                       │
└───────┼───────────────────────────────────────────────────────────┘
        │
┌───────┼───────────────────────────────────────────────────────────┐
│       │              AI Engine (FastAPI)                          │
│       │  Port 8000 · Python 3.10+ · Groq SDK                     │
│       ▼                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ /analyze │  │ /chat        │  │ /review-diff │  │ RAG      │ │
│  │   (batch)│  │ (chat with   │  │ (PR diff     │  │ Pipeline │ │
│  │          │  │  repo)       │  │  review)     │  ├──────────┤ │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  │/api/rag/ │ │
│       │               │                 │           │ split    │ │
│       │               │                 │           │/api/rag/ │ │
│       │               │                 │           │ ingest   │ │
│       │               │                 │           │/api/rag/ │ │
│       │               │                 │           │ query    │ │
│       │               │                 │           │/api/rag/ │ │
│       │               │                 │           │ cleanup  │ │
│       ▼               ▼                 ▼           └────┬─────┘ │
│  ┌──────────────────────────────────────────────────────┼──────┐ │
│  │              Groq Cloud API (LLM)                    │      │ │
│  │  · llama-3.3-70b-versatile (default)                 │      │ │
│  │  · deepseek-r1-distill-llama-70b                     │      │ │
│  │  · llama-3.1-8b-instant                              │      │ │
│  │  · gemma2-9b-it                                      │      │ │
│  └──────────────────────────────────────────────────────┘      │ │
│                                                          │      │ │
│                                                ┌─────────▼────┐ │ │
│                                                │  ChromaDB    │ │ │
│                                                │  Vector DB   │ │ │
│                                                │  (RAG store) │ │ │
│                                                └──────────────┘ │ │
└───────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐  ┌────────────────────────┐
│  GitHub Action (Standalone)          │  │  VS Code Extension     │
│  · Groq SDK direct (no backend dep)  │  │  · Calls Backend API   │
│  · node20, bundled via ncc           │  │  · Webview panel       │
│  · Inline PR comments via Octokit    │  │  · Diagnostics API     │
└──────────────────────────────────────┘  └────────────────────────┘
```

---

## Module Breakdown

### 1. Backend (Express 4 — 2203 lines in index.js + 23 utility modules)

**Routes:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analyze` | POST | Full repo analysis (clone → scan → AI review → metrics → persist) |
| `/api/analyze-file` | POST | Direct file analysis (for VS Code extension) |
| `/api/chat` | POST | Session-isolated AI chat with repo context |
| `/api/webhook` | POST | GitHub webhook receiver for automated PR reviews |
| `/api/issues/create` | POST | Create GitHub issues from analysis |
| `/api/reports/html` | POST | Export HTML audit report |
| `/api/reports/pdf` | POST | Export PDF audit report |
| `/api/analytics/trends` | GET | 30-day health score trends |
| `/api/review-history` | GET | Paginated review history |
| `/api/review-history/:repo` | GET | Per-repo history |
| `/api/review-history/compare/:id1/:id2` | GET | Cross-review comparison |
| `/api/cache/invalidate` | POST | Invalidate analysis cache |
| `/api/session` | POST | Create frontend session |
| `/api/logout` | POST | Clear session/CSRF tokens |
| `/api/csrf-token` | GET | Get fresh CSRF token |
| `/api/rag/query` | POST | Proxy RAG query to AI Engine |
| `/health` | GET | Health check (with DB status) |

**Key Middleware Stack:**
1. `cookieParser()` — Parse cookies for CSRF
2. Raw body capture (webhook route only)
3. `express.json()` — JSON body parsing (limited to 5MB)
4. `csrfProtection()` — CSRF token validation on state-changing methods
5. Rate limiters (per-route: analyze, chat, webhook, issues, export)
6. Route handlers
7. Global error handler

**Security Architecture:**
- CSRF: Token-based, HMAC-signed, with grace period for rotation
- API Key: `REPOSAGE_API_KEY` in header
- Session: HMAC-signed cookies + ownership tokens (IDOR prevention)
- Prompt injection: Homoglyph detection, dangerous phrase matching, NFKC normalization
- Input validation: URL validator, size limits, batch size clamping, model allowlist
- Output sanitization: bleach HTML sanitization with tag/attribute allowlist

**Data Flow for `/api/analyze`:**
```
POST /api/analyze
  │
  ├─ 1. Validate inputs (repoUrl, model, params)
  ├─ 2. Validate system prompt (prompt injection check)
  ├─ 3. Check repo size (GitHub API + clone size check)
  ├─ 4. Clone repo (simple-git, depth=1, blob filter)
  ├─ 5. Load ignore patterns + read files recursively
  ├─ 6. Scan files for prompt injection
  ├─ 7. Check analysis cache (in-memory LRU)
  ├─ 8. Forward to AI Engine (FastAPI /analyze) or fallback to mock
  ├─ 9. Inject secrets detection + complexity metrics
  ├─ 10. Persist session to MongoDB
  ├─ 11. RAG ingestion (split → ingest → verify)
  ├─ 12. Compute health score + persist analytics
  ├─ 13. Clean up cloned repo
  └─ 14. Return structured response
```

### 2. AI Engine (FastAPI — 1037 lines in app.py + 6 supporting modules)

**Routes:**
| Endpoint | Purpose |
|----------|---------|
| `/analyze` | Batch code review with LLM |
| `/chat` | Repository chat with file context |
| `/review-diff` | PR diff review |
| `/api/rag/split` | Split files into chunks |
| `/api/rag/ingest` | Ingest chunks into ChromaDB |
| `/api/rag/query` | Query ChromaDB for relevant chunks |
| `/api/rag/chunks` | Paginated chunk listing |
| `/api/rag/cleanup` | Remove stale vectors |
| `/api/rag/delete-vectors` | Delete vectors for a file |

**LLM Integration:**
- Single provider: Groq Cloud API
- 4 models: Llama 3.3 70B (default), DeepSeek R1, Llama 3.1 8B, Gemma 2 9B
- JSON response format enforced via `response_format={"type": "json_object"}`
- Configurable timeout (default 30s per LLM call)
- Prompt safety: Dangerous phrase sanitization, content wrapping with "read-only" fences
- Output safety: bleach HTML sanitization with SVG/tag allowlist

**RAG Pipeline (Detailed in docs/ARCHITECTURE.md):**
```
Split → Ingest → Query
  │        │        │
  ▼        ▼        ▼
text_splitter  upsert_chunks  query_chunks
  │              │              │
  ▼              ▼              ▼
LangChain    ChromaDB       ChromaDB
Recursive    Collection     Collection
Splitter     (upsert)       (similarity)
```

### 3. Frontend (React 19 — TypeScript 6)

**Pages:** Dashboard.tsx (lazy-loaded, single-page app)
**Layouts:** SidebarLayout.tsx (sidebar navigation wrapper)
**Components:** 11 components (HealthScoreGauge, MetricsChart, VulnerabilitiesBarChart, TotalIssuesKpiCard, QuickFixButton, SettingsModal, etc.)
**State:** zustand store (`useStore.ts`)
**Utilities:** API client (`api.ts`), sanitization (`sanitize.js`), export utils
**Hooks:** `useDebounce.ts`
**Routing:** react-router-dom v7 with lazy-loaded `<Dashboard />`

### 4. GitHub Action (Standalone JS — 309 lines)

- Runs directly in GitHub Actions (no backend dependency)
- Uses Groq SDK + Octokit directly
- Bundled via `@vercel/ncc` into `dist/index.js`
- Duplicates diff parsing and secrets scanning from backend
- Danger phrase list duplicated (not shared from shared-safety-config.json)

### 5. VS Code Extension (TypeScript — Early Stage)

- Activation: Commands (`reposage.reviewCurrentFile`, `reposage.configureApiKey`)
- Webview sidebar for review results
- Mocha + chai tests
- Bundled with esbuild
- Calls Backend API for file analysis

---

## Data Flow Patterns

### Analysis Request (Full Flow)
```
User → Frontend → POST /api/analyze → Backend → Clone Repo
                                                    ↓
                                              Read Files
                                                    ↓
                                        Backend Cache Check (hit→return)
                                                    ↓ (miss)
                                              AI Engine /analyze
                                                    ↓
                                        Groq LLM (batched processing)
                                                    ↓
                                        Response → Backend → Inject Secrets + Metrics
                                                    ↓
                                        Persist Session (MongoDB)
                                                    ↓
                                        RAG Ingest (split → embed → ChromaDB)
                                                    ↓
                                        Persist Analytics (MongoDB)
                                                    ↓
                                        Cleanup Clone → Response → Frontend
```

### Webhook PR Review Flow
```
GitHub PR → Webhook → Backend → Verify Signature
                                    ↓
                              Dedup Check (Redis/In-Memory)
                                    ↓
                              Parse Diff → Secrets Scan
                                    ↓
                              AI Engine /review-diff
                                    ↓
                              Post PR Review Comment
```

### Chat Flow
```
User → Frontend → POST /api/chat → Backend → Verify Session (MongoDB)
                                                ↓
                                          Ownership Check (IDOR prevention)
                                                ↓
                                          Acquire Session Lock (ReviewQueue)
                                                ↓
                                          AI Engine /chat (with RAG context)
                                                ↓
                                          LLM Response → Backend → Frontend
```

---

## Cross-Cutting Concerns

### Duplicated Logic (Known Technical Debt)
1. **Dangerous phrases**: `shared-safety-config.json` is the single source of truth, but the GitHub Action has a hardcoded duplicate list
2. **Secrets scanning**: Implemented in both `backend/utils/secretsScanner.js` and `github-action/utils/secretsScanner.js`
3. **Diff parsing**: Duplicated in `backend/utils/diffParser.js` and `github-action/utils/diffParser.js`
4. **File extensions**: 17 extension allowlist duplicated in backend, GitHub Action, and AI Engine

### Caching Layers
1. **Analysis Cache** (in-memory LRU with TTL) — Avoids redundant LLM calls
2. **Webhook Dedup** (Redis/In-Memory SET) — Prevents duplicate PR reviews
3. **SHA Dedup** (Redis/In-Memory Map) — Prevents re-reviewing same commit
4. **MongoDB TTL Index** — Session auto-expiry
5. **ChromaDB upsert** — Atomic RAG chunk updates

### Error Handling Strategy
- Backend: Global error handler, `express-async-errors`, per-route try/catch
- AI Engine: Route-level try/catch, Groq timeout (HTTP 504), degraded fallback
- Chat: Session-lock with ReviewQueue for race condition prevention
- Webhook: Dedup before processing, rollback SHA dedup on failure

### Graceful Degradation
- MongoDB offline: Backend runs in degraded mode, file-based analytics
- AI Engine offline: Backend falls back to `mockAIReview`
- ChromaDB offline: RAG skipped, chat still works with file context
- Redis offline: Falls back to in-memory Maps for dedup/rate limiting
- Groq API offline: AI Engine fails with 500, backend mock fallback
