# RepoSage — Comprehensive Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 75+ source files across 6 modules
**Analogs found:** Comprehensive coverage (all modules have strong matches)

---

## 1. Cross-Module Architecture & Data Flow

```
┌──────────────────┐     HTTP/JSON      ┌──────────────────┐     HTTP/JSON      ┌──────────────┐
│   Frontend       │  ────────────────▶  │    Backend       │  ────────────────▶  │   AI Engine  │
│   (React 19 +    │  ◀────────────────  │   (Express +     │  ◀────────────────  │  (FastAPI +  │
│    Vite + TS)    │     CSRF cookies    │    Node 18+)     │     x-api-key      │   Groq LLM)  │
│                  │                     │                  │                     │              │
│  Port 3000       │                     │  Port 5000       │                     │  Port 8000   │
└──────────────────┘                     └──────────────────┘                     └──────────────┘
                                                   │                                      │
                                                   │ MongoDB / File-based                  │ ChromaDB / File-based
                                                   │ analytics                            │ vector store (RAG)
                                                   ▼                                      ▼
                                          ┌─────────────────┐                  ┌──────────────────┐
                                          │   Models:        │                  │  ChromaDB         │
                                          │   Analytics.js   │                  │  (persistent or   │
                                          │   Session.js     │                  │   HTTP client)    │
                                          └─────────────────┘                  └──────────────────┘

┌──────────────────┐     GitHub API       ┌──────────────────┐
│   GitHub Action  │  ────────────────▶   │   GitHub PR API  │
│   (Groq SDK      │  ◀────────────────   │   (Octokit)      │
│    directly)     │    PR review post    │                  │
│                  │                      │                  │
│  Runs on:        │                      │                  │
│  push/pull_req   │                      │                  │
└──────────────────┘                      └──────────────────┘

┌──────────────────┐     HTTP/JSON      ┌──────────────────┐
│   VS Code        │  ────────────────▶  │   Backend        │
│   Extension      │  ◀────────────────  │   /api/analyze-  │
│   (No SDK)       │    x-api-key auth   │   file           │
└──────────────────┘                     └──────────────────┘
```

---

## 2. Backend (Node.js/Express) Patterns

### 2.1 Project Structure & Module Organization

**File:** `backend/index.js` (lines 1-2203)

**Pattern:** Single-file Express app with all routes defined inline. All utilities are imported from `utils/`, models from `models/`, config from `config/`.

```javascript
// backend/index.js — import pattern (lines 1-37)
import 'express-async-errors';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
// ... standard imports
import { createFrontendSessionCookie, requireApiKey, SESSION_COOKIE_NAME, validateSessionSecret } from './utils/authMiddleware.js';
import { scanSecrets, scanSecretsInChanges } from './utils/secretsScanner.js';
import { loadIgnorePatterns, readFilesRecursively } from './utils/ignoreHelper.js';
import ReviewQueue from './utils/reviewQueue.js';
import AnalysisCache from './utils/analysisCache.js';
```

**Key observation:** This is a monolithic single-file API server (~2200 lines). All 20+ utility modules are imported at the top. Routes are defined with `app.post('/api/...', middleware, handler)` inline.

### 2.2 Route Definition Pattern

**File:** `backend/index.js` (lines 554-984)

```javascript
// 🟢 Route: GitHub Import & AI Review
app.post('/api/analyze', requireApiKey, requireJsonContentType, analyzeLimiter, async (req, res) => {
  // 1. Destructure + validate request body with defaults
  let { repoUrl, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile',
     temperature = 0.7, maxTokens = 2048, systemPrompt = '', batchSize = 5 } = req.body;

  // 2. Enforce boundary limits
  batchSize = Math.max(1, Math.min(20, parseInt(batchSize, 10) || 5));
  temperature = Math.max(0, Math.min(2, parseFloat(temperature) || 0.7));

  // 3. Validate model against allowed list
  const normalizedModel = ALLOWED_ANALYSIS_MODELS.find(m => m.toLowerCase() === model.toLowerCase());

  // 4. Early return on validation failure
  if (!repoUrl) return res.status(400).json({ error: 'GitHub Repository URL is required.' });

  // 5. Try/catch around the main business logic
  try {
    // ... main logic ...
    return res.json({ success: true, ... });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'An error occurred during repository analysis.' });
  }
});
```

**Common elements observed in ALL routes:**
- `requireApiKey` middleware for authentication
- `requireJsonContentType` middleware for POST routes
- Named rate limiters: `analyzeLimiter`, `issueLimiter`, `chatLimiter`, `exportLimiter`
- Input destructuring with defaults
- `try/catch` with `console.error` + `res.status(500).json({ error: ... })`
- Response shape: `{ success: true, ... }` or `{ error: '...' }`
- Emoji-prefixed console logs: `console.log(\`🚀 Cloning: ${repoUrl}\`)`

### 2.3 Authentication Pattern

**File:** `backend/utils/authMiddleware.js` (lines 105-137)

```javascript
export const requireApiKey = (req, res, next) => {
  const validKey = getConfiguredApiKey(res);
  if (!validKey) return;

  const providedKey = Array.isArray(req.headers['x-api-key'])
    ? req.headers['x-api-key'][0]
    : req.headers['x-api-key'];

  // Session cookie takes priority
  const cookieData = decodeSessionCookie(req);
  if (cookieData && Number.isFinite(cookieData.exp) && cookieData.exp > Date.now()) {
    req.clientId = cookieData.uid;
    next();
    return;
  }

  // API key fallback
  if (providedKey && safeEqual(providedKey, validKey)) {
    req.clientId = crypto.randomUUID();
    next();
    return;
  }

  console.warn(`Unauthorized request attempt to ${req.originalUrl}`);
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
};
```

**Dual auth mechanism:** Session cookie (HMAC-signed) OR `x-api-key` header. Cookie uses `crypto.timingSafeEqual` for constant-time comparison.

### 2.4 CSRF Protection Pattern

**File:** `backend/index.js` (lines 170-283)

```javascript
// CSRF token generation (line 193)
function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokenStore.set(token, Date.now() + CSRF_TOKEN_TTL_MS);
  return token;
}

// CSRF validation middleware (line 231)
function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!headerToken || !cookieToken) {
      // Allow session creation and webhook endpoints
      if (req.path.endsWith('/api/session') || req.path.endsWith('/api/csrf-token') || req.path.endsWith('/api/webhook')) {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    // Constant-time comparison
    const headerBuf = Buffer.from(String(headerToken));
    const cookieBuf = Buffer.from(String(cookieToken));
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
  }
  next();
}
```

**Pattern:** Token rotation with grace period, constant-time comparison, in-memory store with TTL cleanup.

### 2.5 Rate Limiting Pattern

**File:** `backend/index.js` (lines 91-128)

```javascript
const analyzeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many analyze requests. Please slow down and retry after 5 minutes.' }
});
```

**Pattern:** Named limiter per endpoint, optional Redis store, always returns `{ error: '...' }`.

### 2.6 Webhook Handling Pattern

**File:** `backend/index.js` (lines 1242-1386)

**Deduplication:** Redis SETNX with in-memory fallback. SHA-based per-commit dedup. GitHub webhook signature verification via `verifyWebhookSignature()`.

```javascript
app.post('/api/webhook', webhookLimiter, async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyWebhookSignature(req.rawBody, signature, webhookSecret)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  // ... event dispatch with dedup via Redis SETNX or in-memory Set
});
```

### 2.7 Caching Pattern

**File:** `backend/utils/analysisCache.js`

**Class-based design with sliding TTL + absolute max TTL:**
```javascript
class AnalysisCache {
  constructor(ttlMs = 3600000, absoluteMaxMultiplier = 2) {
    this.cache = new Map();
    this._repoUrlIndex = new Map();
    this._locks = new Map(); // per-key AsyncLock for thundering herd prevention
  }

  generateKey(repoUrl, files, params) { /* sha256 hash of all inputs */ }

  getOrSet(key, fetcher, repoUrl) {
    // Double-check locking pattern with AsyncLock
  }
}

// AsyncLock helper (line 12)
class AsyncLock {
  async acquire(fn) {
    while (this._promise) { await this._promise; }
    this._promise = new Promise(resolve => { this._resolve = resolve; });
    try { return await fn(); }
    finally {
      const resolve = this._resolve;
      this._promise = null; this._resolve = null;
      if (resolve) resolve();
    }
  }
}
```

### 2.8 Error Handling Pattern

**File:** `backend/index.js` (lines 2169-2182)

```javascript
// Centralized error handler
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error in request:', err.message);
  if (err.stack) console.error(err.stack);
  if (res.headersSent) return next(err);
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};
app.use(errorHandler);
```

**Pattern:** Uses `express-async-errors` (line 1) to catch async errors. Global error handler at the bottom. Routes have their own `try/catch` as well (belt-and-suspenders).

### 2.9 Secrets Scanner Pattern

**File:** `backend/utils/secretsScanner.js` (lines 1-77)

**Pattern:** Array of rule objects with `type`, `regex`, and `description`. Line-by-line scanning with configurable timeout and max line length. Two entry points: `scanSecrets` (single file) and `scanSecretsInChanges` (diff changes).

```javascript
export const rules = [
  { type: "AWS Access Key Check", regex: /AKIA[0-9A-Z]{16}/g, description: "..." },
  // ... 15+ rules
];

export function scanSecrets(fileContent) {
  // Iterates lines, applies each regex, returns findings array
}
```

### 2.10 Queue Pattern

**File:** `backend/utils/reviewQueue.js`

**Pattern:** Promise-chain based per-key serial queue with exponential backoff retry.

```javascript
class ReviewQueue {
  async enqueue(key, item, processor) {
    const prev = this._queueLocks.get(key) || Promise.resolve();
    const next = prev.then(async () => { /* ... */ });
    this._queueLocks.set(key, next);
    return next.then(() => this._processNext(key, processor));
  }

  async runExclusive(key, fn) {
    // Per-key mutex for database operations (prevents lost updates)
  }
}
```

### 2.11 Backend Testing Pattern

**File:** `backend/tests/run-tests.js` (lines 1-140)

**Pattern:** Custom test runner using `node:test` and `node:assert/strict`. Environment variables set before imports.

```javascript
// File: backend/tests/authMiddleware.test.js (lines 1-10)
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.REPOSAGE_API_KEY = 'test-secret-key';
process.env.SESSION_SECRET = 'test-session-secret';

import { createFrontendSessionCookie, requireApiKey } from '../utils/authMiddleware.js';

function makeMockReqRes({ providedKey = '', cookie = '' } = {}) {
  const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; }, cookie() { return this; } };
  const req = { headers: { ...(providedKey ? { 'x-api-key': providedKey } : {}), ...(cookie ? { cookie } : {}) }, originalUrl: '/api/test' };
  return { req, res };
}

test('requireApiKey calls next() when valid key is provided', () => {
  const { req, res } = makeMockReqRes({ providedKey: 'test-secret-key' });
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  requireApiKey(req, res, next);
  assert.equal(nextCalled, true);
});
```

---

## 3. Frontend (React 19 + Vite + TypeScript) Patterns

### 3.1 File Organization

```
frontend/src/
  main.tsx              # Entry point
  App.tsx               # Router + lazy loading
  index.css             # Global styles (CSS variables)
  pages/Dashboard.tsx   # Main page (~2000+ lines, monolithic)
  components/           # 11 reusable components
  hooks/                # 2 hooks (useDebounce)
  store/                # Zustand store
  layouts/              # SidebarLayout
  utils/                # api, exportUtils, sanitize
```

### 3.2 Entry Point Pattern

**File:** `frontend/src/main.tsx` (lines 1-10)

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
```

### 3.3 Routing & Lazy Loading Pattern

**File:** `frontend/src/App.tsx` (lines 1-58)

```typescript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <Suspense fallback={/* spinner */}>
              <Dashboard />
            </Suspense>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

### 3.4 State Management Pattern (Zustand)

**File:** `frontend/src/store/useStore.ts` (lines 1-46)

```typescript
import { create } from 'zustand';
import { BackendResponse } from '../pages/Dashboard';

export interface ChatMessage { role: "user" | "assistant"; content: string; sources?: { file: string; line: number }[]; }

interface GlobalState {
  analysisResult: BackendResponse | null;
  setAnalysisResult: (result: BackendResponse | null) => void;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

export const useStore = create<GlobalState>((set) => ({
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  // ...
}));
```

**Pattern:** Zustand store with explicit types. `setChatHistory` supports both direct array and updater function patterns. localStorage persistence for chat history.

### 3.5 API Fetch Pattern (CSRF-Aware)

**File:** `frontend/src/utils/api.ts` (lines 84-144)

```typescript
export const apiFetch = async (
  path: string,
  options: RequestInit = {},
  timeoutMs = 60000,
  retryOnCsrfFailure = true
): Promise<Response> => {
  await ensureApiSession();  // Auto-authenticate via /api/session
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) { headers.set("Content-Type", "application/json"); }

  // Automatically attach CSRF token to state-changing requests
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, credentials: "include", headers, signal: controller.signal });
    // CSRF token rotation: re-read from cookie after each response
    if (retryOnCsrfFailure && await isCsrfFailure(response)) {
      const refreshedToken = await refreshCsrfToken();
      if (refreshedToken) return apiFetch(path, { ...options, headers: retryHeaders }, timeoutMs, false);
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw error;
  }
};
```

### 3.6 UI Patterns

**All components use inline styles** (no CSS modules, Tailwind, or styled-components). Dark theme default with CSS custom properties:

```css
/* From index.css */
:root { --bg-color: #0f172a; --panel-bg: #1e293b; --text-color: #f3f4f6; --subtext-color: #9ca3af; }
[data-theme="light"] { --bg-color: #f8fafc; --panel-bg: #ffffff; --text-color: #1e293b; --subtext-color: #64748b; }
```

**Component naming:** PascalCase (`HealthScoreGauge.tsx`, `SettingsModal.tsx`, `VulnerabilitiesBarChart.tsx`).
**Icon library:** `lucide-react` for all icons.
**Panel class:** `className="glass-panel"` for card-style containers.

### 3.7 Component Pattern

**File:** `frontend/src/components/HealthScoreGauge.tsx` (lines 1-164)

```typescript
interface Props {
  fileReviews: Record<string, FileReview>;
  isLoading?: boolean;
  theme?: 'dark' | 'light';
}

export default function HealthScoreGauge({ fileReviews, isLoading = false, theme = 'dark' }: Props) {
  const score = computeHealthScore(fileReviews);
  const colors = getScoreColor(score);

  return (
    <div className="glass-panel" style={{ /* inline styles */ }}>
      {/* ... */}
    </div>
  );
}
```

**Pattern:** Components export as default function, have typed Props interface, use inline styles, and follow the `className="glass-panel"` wrapper convention.

### 3.8 Frontend Testing Pattern

**File:** `frontend/src/store/useStore.test.js` (lines 1-96)

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore.ts';

describe('useStore', () => {
  beforeEach(() => { useStore.setState({ analysisResult: null, selectedFile: null, chatHistory: [] }); });

  it('initial state has null analysisResult', () => {
    expect(useStore.getState().analysisResult).toBeNull();
  });
  // ...
});
```

**Pattern:** Vitest-based, `describe/it` blocks, `beforeEach` for state reset, direct zustand `getState/setState` for testing.

---

## 4. AI Engine (Python/FastAPI) Patterns

### 4.1 File Organization

```
ai-engine/
  app.py                # Main FastAPI app (~1037 lines)
  diff_helper.py        # Git diff utilities
  embeddings.py         # Sentence transformer with fallback
  rag.py                # ChromaDB vector store operations
  text_splitter.py      # LangChain text splitting
  conftest.py           # Pytest fixtures (mocks sentence_transformers)
  pytest.ini            # [pytest] pythonpath = .
```

### 4.2 FastAPI App Pattern

**File:** `ai-engine/app.py` (lines 1-1037)

```python
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Set

app = FastAPI(title="RepoSage AI Engine", description="FastAPI microservice for repository analysis and documentation generation")

# CORS setup
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "x-api-key", "x-csrf-token"])

# API key middleware
async def require_api_key(request: Request, call_next):
    # ...
app.middleware("http")(require_api_key)
```

### 4.3 Pydantic Model Pattern

**File:** `ai-engine/app.py` (lines 366-395)

```python
class FileItem(BaseModel):
    name: str
    content: str

class AnalyzeRequest(BaseModel):
    files: List[FileItem]
    company: Optional[str] = "General"
    language: Optional[str] = "English"
    model: Optional[str] = "llama-3.3-70b-versatile"
    temperature: Optional[float] = Field(0.7, ge=0, le=2)
    maxTokens: Optional[int] = Field(2048, ge=1, le=32768)
    systemPrompt: Optional[str] = ""
    batchSize: Optional[int] = Field(5, ge=1, le=20)
```

**Pattern:** All request/response bodies use Pydantic `BaseModel` with `Field` validators. Type hints from `typing` (Optional, List).

### 4.4 Endpoint Pattern

**File:** `ai-engine/app.py` (lines 410-638)

```python
@app.post("/analyze")
async def analyze_repository(request: AnalyzeRequest):
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq API client is not configured on this engine.")

    # 1. Extract fields from request
    files = request.files
    files.sort(key=lambda f: f.name)

    # 2. Batch processing
    batches = [files[i:i + batch_size] for i in range(0, len(files), batch_size)]
    combined_result = {"fileReviews": {}, "generatedReadme": "", "mermaidDiagram": ""}

    # 3. Process batches sequentially
    for idx, batch in enumerate(batches):
        try:
            completion = await _call_groq_with_timeout(model=groq_model, messages=[...])
            batch_result = json.loads(completion.choices[0].message.content)
            # Merge results
            for file_path, review in batch_result["fileReviews"].items():
                # Deduplicate findings across batches
        except Exception as e:
            print(f"❌ Groq API Call Failed for batch {idx + 1}: {_redact_key(str(e), api_key)}")
            if is_first_batch:
                raise HTTPException(status_code=500, detail=f"Groq API reasoning failed on first batch")

    return combined_result
```

### 4.5 Groq LLM Call Pattern

**File:** `ai-engine/app.py` (lines 238-253)

```python
async def _call_groq_with_timeout(**kwargs):
    """Run a synchronous Groq completion in a thread-pool executor with a
    configurable wall-clock timeout. Raises HTTP 504 if the LLM does not
    respond within LLM_TIMEOUT_SECONDS seconds."""
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, lambda: groq_client.chat.completions.create(**kwargs)),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"LLM request timed out after {int(LLM_TIMEOUT_SECONDS)}s.")
```

**Pattern:** Synchronous Groq SDK wrapped in `run_in_executor` with `asyncio.wait_for` timeout.

### 4.6 Prompt Injection Defense

**File:** `ai-engine/app.py` (lines 59-84, 148-193, 211-237)

```python
# Sanitize file content before sending to LLM
def sanitize_file_content(content: str) -> str:
    for _round in range(3):
        for pattern in DANGEROUS_PATTERNS:
            content = _neutralize_pattern(content, pattern)
    # Wrap in read-only markers
    wrapped = "--- BEGIN FILE CONTENT (read-only code context) ---\n" + content + "\n--- END FILE CONTENT ---"
    return wrapped

# Validate system prompt
def validate_system_prompt(prompt: str, max_len: int = 2000) -> str:
    normalized = unicodedata.normalize("NFKC", prompt.strip())
    # Remove zero-width characters
    # Detect homoglyphs > 30% threshold
    # Check for dangerous phrases
    # Raise HTTPException on violation
```

### 4.7 ChromaDB Vector Store Pattern

**File:** `ai-engine/rag.py` (lines 1-250)

```python
# Singleton client with thread-safe lazy initialization
def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                if _CHROMA_HOST:
                    _client = chromadb.HttpClient(...)
                else:
                    _client = chromadb.PersistentClient(...)
    return _client

# Tenant-isolated collection namespacing
def _collection_name(repo_url: Optional[str] = None) -> str:
    if repo_url:
        suffix = hashlib.sha256(repo_url.encode()).hexdigest()[:12]
        return f"{_COLLECTION_NAME}_{suffix}"
    return _COLLECTION_NAME
```

**Pattern:** Lazy singleton client, per-repo collection isolation, `upsert` for deduplication, cosine similarity space.

### 4.8 Embeddings Pattern

**File:** `ai-engine/embeddings.py` (lines 1-153)

```python
# Try-load sentence-transformers, fall back to deterministic hash
class _DeterministicEmbeddingModel:
    def encode(self, texts, normalize_embeddings=True):
        # Blake2b hash-based deterministic embeddings
        pass

# LRU cache with content hash for embeddings
_embedding_cache = collections.OrderedDict()
def get_or_compute_embedding(file_path, content):
    if cached and cached["content_hash"] == content_hash:
        return cached["embedding"]
```

### 4.9 AI Engine Testing Pattern

**File:** `ai-engine/conftest.py` (lines 1-19)

```python
# Mock sentence_transformers BEFORE any test imports it
class _FakeSentenceTransformers:
    SentenceTransformer = None
sys.modules["sentence_transformers"] = _FakeSentenceTransformers()

def pytest_configure(config):
    import embeddings as _emb
    _emb._fallback_active = True
```

**File:** `ai-engine/tests/test_app.py` (lines 1-48)

```python
import pytest
from app import get_groq_model

class TestGetGroqModel:
    def test_returns_default_for_none(self):
        result = get_groq_model(None)
        assert result == "llama-3.3-70b-versatile"
    # ... 10+ test methods
```

---

## 5. VS Code Extension Patterns

### 5.1 Activation Pattern

**File:** `vscode-extension/src/extension.ts` (lines 26-149)

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // 1. Migrate legacy config to SecretStorage
  const legacyKey = vscode.workspace.getConfiguration("reposage").get<string>("apiKey", "");
  if (legacyKey) { await context.secrets.store(SECRET_KEY, legacyKey); }

  // 2. Register providers
  context.subscriptions.push(new RepoSageDiagnostics());
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(RepoSageWebviewProvider.viewType, provider));

  // 3. Register commands
  context.subscriptions.push(vscode.commands.registerCommand("reposage.reviewCurrentFile", async () => { /* ... */ }));

  // 4. Status bar
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  await updateApiKeyStatusBar(statusBarItem, context.secrets);
  statusBarItem.show();
}
```

### 5.2 Webview Pattern

**File:** `vscode-extension/src/webviewProvider.ts` (lines 185-259)

```typescript
export class RepoSageWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "reposage.sidebarView";
  private _view?: vscode.WebviewView;
  private _markdown: string = "";

  public resolveWebviewView(webviewView, _context, _token) {
    webviewView.webview.html = getWebviewContent(this._markdown, this._isLoading, this._error);
  }

  public setContent(markdown: string) { /* update state + re-render */ }
  public setLoading(loading: boolean) { /* show spinner */ }
  public setError(error: string) { /* show error */ }
}
```

### 5.3 Diagnostics Pattern

**File:** `vscode-extension/src/diagnostics.ts` (lines 1-90)

```typescript
export class RepoSageDiagnostics {
  private _collection: vscode.DiagnosticCollection;

  public updateFromResponse(response: BackendResponse, targetFile: string) {
    const diagnostics: vscode.Diagnostic[] = [];
    // Map security → Error, bugs → Error, optimization → Warning, styling → Information
    this._collection.set(uri, diagnostics);
  }
}
```

---

## 6. GitHub Action Patterns

### 6.1 Action Structure

**File:** `github-action/action.yml` (lines 1-32)

```yaml
name: 'RepoSage AI Copilot Reviewer'
inputs:
  github-token:   { required: true }
  groq-api-key:   { required: true }
  exclude-paths:  { required: false, default: 'package-lock.json,yarn.lock,...' }
  include-extensions: { required: false, default: '' }
  max-tokens:     { required: false, default: '4096' }
  auto-approve:   { required: false, default: 'false' }
runs:
  using: 'node20'
  main: 'dist/index.js'
```

### 6.2 Action Run Pattern

**File:** `github-action/index.js` (lines 58-309)

```javascript
async function run() {
  try {
    const githubToken = core.getInput('github-token', { required: true });
    const groqApiKey = core.getInput('groq-api-key', { required: true });
    const octokit = github.getOctokit(githubToken);
    const groq = new Groq({ apiKey: groqApiKey });

    // 1. Verify PR context
    const { owner, repo, number: pullNumber } = github.context.issue;

    // 2. Fetch diff
    const { data: diff } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber, mediaType: { format: 'diff' } });

    // 3. Parse diff + review each file
    for (const file of parsedFiles) {
      const completion = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [...], response_format: { type: 'json_object' } });
      // Parse JSON from response, push comments
    }

    // 4. Post consolidated review
    await octokit.rest.pulls.createReview({ owner, repo, pull_number: pullNumber, event: 'COMMENT', body: '...', comments: commentsToPost });
  } catch (err) {
    core.setFailed(`❌ Action run failed: ${err.message}`);
  }
}
run();
```

### 6.3 Diff Parser (Synced Pattern)

**File:** `github-action/utils/diffParser.js` (line 1-5)

```javascript
// ─────────────────────────────────────────────────────
// IMPORTANT: This file is synced from backend/utils/diffParser.js.
// To ensure consistency, run: node scripts/sync-diff-parser.js
// ─────────────────────────────────────────────────────
```

---

## 7. Naming Conventions

| Category | Convention | Examples |
|----------|-----------|---------|
| **Backend files** | camelCase | `analysisCache.js`, `secretsScanner.js`, `authMiddleware.js` |
| **Backend models** | PascalCase | `Analytics.js`, `Session.js` |
| **Backend classes** | PascalCase | `AnalysisCache`, `ReviewQueue`, `AsyncLock` |
| **Backend exports** | named functions | `export function scanSecrets()`, `export const requireApiKey = ...` |
| **Backend default exports** | classes | `export default ReviewQueue`, `export default AnalysisCache` |
| **Frontend files** | PascalCase (components) | `Dashboard.tsx`, `HealthScoreGauge.tsx`, `SidebarLayout.tsx` |
| **Frontend files** | camelCase (utils/hooks) | `useDebounce.ts`, `exportUtils.ts`, `sanitize.js` |
| **Frontend functions** | PascalCase (components), camelCase (hooks/utils) | `export default function Dashboard()`, `export function useDebounce()` |
| **Frontend interfaces** | PascalCase with `I` prefix optional | `BackendResponse`, `FileReview`, `ReviewItem`, `ChatMessage` |
| **AI Engine files** | snake_case | `app.py`, `diff_helper.py`, `text_splitter.py`, `embeddings.py` |
| **AI Engine classes** | PascalCase | `AnalyzeRequest`, `ChatRequest`, `FileItem` |
| **AI Engine functions** | snake_case | `validate_system_prompt()`, `sanitize_file_content()`, `_call_groq_with_timeout()` |
| **AI Engine tests** | `test_<module>.py` | `test_app.py`, `test_rag_query.py`, `test_diff_helper.py` |
| **Backend tests** | `<module>.test.js` | `authMiddleware.test.js`, `secretsScanner.test.js` |
| **VS Code Extension** | PascalCase classes, camelCase files | `RepoSageDiagnostics`, `RepoSageWebviewProvider`, `extension.ts` |
| **GitHub Action** | camelCase | `actionUtils.js`, `diffParser.js`, `globToRegex.js` |

---

## 8. Config & Environment Patterns

### 8.1 Backend Environment Variables

**File:** `backend/config/env.js` (lines 1-11)

```javascript
function parsePositiveInt(value, name, defaultVal) {
  const num = parseInt(value, 10);
  if (Number.isFinite(num) && num > 0) return num;
  return defaultVal;
}
export const GIT_CLONE_TIMEOUT = parsePositiveInt(process.env.GIT_CLONE_TIMEOUT, 'GIT_CLONE_TIMEOUT', 120000);
```

**Pattern:** Helper functions with safe defaults, process.env fallback with parseInt guards.

### 8.2 Database Connection Pattern

**File:** `backend/config/db.js` (lines 1-103)

```javascript
let isConnected = false;
let connectionPromise = null;

export async function connectDatabase() {
  if (isConnected) return;
  if (connectionPromise) return connectionPromise;
  connectionPromise = mongoose.connect(MONGODB_URI, { ... })
    .then((conn) => { isConnected = true; return conn; })
    .catch((err) => { isConnected = false; connectionPromise = null; /* degraded mode */ });
  return connectionPromise;
}
```

**Pattern:** Promise-based singleton with `isConnected` flag, degraded mode when DB unavailable, reconnection with backoff.

### 8.3 AI Engine Environment Loading

**File:** `ai-engine/app.py` (lines 22-36)

```python
env_paths = [
    os.path.join(os.path.dirname(__file__), '.env'),
    os.path.join(os.path.dirname(__file__), '../backend/.env'),
]
for env_path in env_paths:
    if os.path.isfile(abs_path):
        load_dotenv(dotenv_path=abs_path)
```

**Pattern:** Multi-path fallback for `.env` file loading (local first, then shared backend config).

### 8.4 Shared Safety Config Pattern

**File:** `shared-safety-config.json` (lines 1-38)

```json
{
  "_warning": "This file is the SINGLE SOURCE OF TRUTH for homoglyph maps and dangerous phrases. All consumers MUST read from this file at runtime.",
  "version": "1.0.0",
  "homoglyph_map": { "а": "a", "е": "e", ... },
  "dangerous_phrases": ["ignore all", "ignore all previous instructions", ...]
}
```

**Pattern:** JSON-based shared config consumed by both backend (`dangerousPhrases.js`) and AI engine (`app.py`). Single source of truth for security patterns.

---

## 9. Mongoose Model Patterns

### 9.1 Analytics Model

**File:** `backend/models/Analytics.js` (lines 1-119)

```javascript
import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  sessionId: { type: String, index: true },
  repoUrl: { type: String, required: true },
  repoName: { type: String, required: true },
  filesReviewedCount: { type: Number, required: true },
  totalBugs: { type: Number, default: 0 },
  // ... more fields with defaults
  analyzedAt: { type: Date, default: Date.now, expires: 2592000 }, // 30-day TTL
});

analyticsSchema.index({ analyzedAt: -1 });
analyticsSchema.index({ repoName: 1, analyzedAt: -1 });

export default mongoose.model('Analytics', analyticsSchema);
```

### 9.2 Session Model

**File:** `backend/models/Session.js` (lines 1-84)

```javascript
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  repoUrl: { type: String, required: true },
  files: { type: [{ _id: false, name: { type: String, required: true }, content: { type: String, required: true } }], default: [] },
  ownerToken: { type: String, index: true },
  absoluteExpiry: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
});

// TTL index for automatic expiry
sessionSchema.index({ absoluteExpiry: 1 }, { expireAfterSeconds: 0 });

export function estimateSessionSize(files) { /* byte-size estimation */ }
export default mongoose.model('Session', sessionSchema);
```

**Key pattern:** `_id: false` on subdocuments to save space. Single TTL index. `ownerToken` for IDOR prevention. Sliding-window expiry in application code (not via TTL).

---

## 10. Cross-Cutting Security Patterns

### 10.1 Prompt Injection Defense (3 layers)

1. **Content sanitization** (`sanitize_file_content` in `ai-engine/app.py`): Wraps user code in read-only markers, neutralizes dangerous phrases
2. **Prompt validation** (`validate_system_prompt` in both `backend/index.js` and `ai-engine/app.py`): NFKC normalization, homoglyph detection, dangerous phrase filtering
3. **Output sanitization** (`sanitize_ai_output` in `ai-engine/app.py`): Bleach-based HTML sanitization on LLM output

### 10.2 Authentication (3 layers)

1. **API Key** (`requireApiKey` in `backend/utils/authMiddleware.js`): `x-api-key` header
2. **Session Cookie** (same middleware): HMAC-signed cookie for frontend sessions
3. **AI Engine Key** (`verify_api_key` in `ai-engine/app.py`): `x-api-key` header

### 10.3 CSRF Protection

- Token-based: random bytes stored in memory + cookie
- Rotation on every state-changing request with grace period
- Constant-time comparison

---

## 11. Testing Patterns

| Module | Framework | Runner | Key Pattern |
|--------|-----------|--------|-------------|
| **Backend** | `node:test` + `node:assert/strict` | Custom `run-tests.js` | Environment vars set before imports, mock req/res objects |
| **Frontend** | Vitest | Vitest via npm | Zustand stores tested via `getState/setState` |
| **AI Engine** | pytest + pytest-asyncio | pytest | `conftest.py` mocks sentence_transformers at module level |
| **GitHub Action** | Node test | Custom | Mock GitHub context |

---

## 12. Identified Inconsistencies & Anti-Patterns

### 12.1 Monolithic Files
- **`backend/index.js`** (~2203 lines): All routes in one file. Should be split into route modules.
- **`frontend/src/pages/Dashboard.tsx`** (~2000+ lines): Single page component with inline styles, file tree builder, markdown renderer, chat interface, and more. Should be decomposed.
- **`ai-engine/app.py`** (~1037 lines): Growing monolith with route handlers, models, and middleware all in one file.

### 12.2 Inline Styles Everywhere (Frontend)
All frontend components use inline `style={{}}` objects with no CSS modules or CSS-in-JS. This creates performance overhead (new style objects per render) and makes overrides difficult. No separation of concerns between structure and presentation.

### 12.3 Inconsistent Error Response Shape
Backend sometimes returns `{ error: '...' }` (most routes) and sometimes `{ success: false, error: '...' }` (issue creation route at line 1442). Frontend `api.ts` expects only `error` field but catches both.

### 12.4 Mixed `catch` Clause Types (Frontend)
The Dashboard uses `catch(err: unknown)` in some places and `catch(e: any)` in others (e.g., line 1009: `catch (e: any)`). There's even a TODO about this (line 58 of App.tsx).

### 12.5 Backend Test Runner in JavaScript
The backend test runner (`run-tests.js`) is a custom script that sets `NODE_ENV='test'` and runs child processes. Other test files use `node:test`, but they are all orchestrated by the custom runner rather than using Jest, Vitest, or a more standard test framework.

### 12.6 Duplicated Code
- **Diff parser** is duplicated between `backend/utils/diffParser.js` and `github-action/utils/diffParser.js` (though synced manually).
- **Dangerous phrases** and **homoglyph maps** are defined in `shared-safety-config.json` but also hardcoded in `github-action/index.js` (lines 25-47).
- **Model selection logic** exists in both `backend/index.js` (line 53) and `ai-engine/app.py` (line 135).

### 12.7 Magic Strings & Numbers
Many string constants are inlined rather than centralized (e.g., ALLOWED_ANALYSIS_MODELS in `backend/index.js` line 53, model mappings in `get_groq_model()` at `ai-engine/app.py` lines 135-146).

### 12.8 File-Based Locking
`analyticsStore.js` implements a custom promise-chain lock for file-based analytics storage. This is fragile and doesn't work across processes.

---

## 13. Analog Lookup Table

| If creating a new... | Look at this file as analog | What to copy |
|----------------------|----------------------------|--------------|
| **Backend route** | `backend/index.js` (any route, e.g., lines 554-984) | Route definition pattern, input validation, try/catch, response shape |
| **Backend utility (class)** | `backend/utils/analysisCache.js` | Class structure, TTL management, index cleanup |
| **Backend utility (functions)** | `backend/utils/secretsScanner.js` | Exported functions with configurable params, timeout pattern |
| **Backend middleware** | `backend/utils/authMiddleware.js` | Middleware signature, req/res manipulation, error responses |
| **Backend Mongoose model** | `backend/models/Analytics.js` | Schema definition, indexes, default exports |
| **Frontend API client** | `frontend/src/utils/api.ts` | CSRF handling, session initialization, timeout, error handling |
| **Frontend component** | `frontend/src/components/HealthScoreGauge.tsx` | Props interface, default function export, inline styles, glass-panel class |
| **Frontend page** | `frontend/src/pages/Dashboard.tsx` | State hooks, apiFetch calls, loading/error states, form handling |
| **Frontend state store** | `frontend/src/store/useStore.ts` | Zustand create pattern, typed state, setter functions |
| **AI Engine endpoint** | `ai-engine/app.py` ("/analyze" at line 410) | Pydantic model, async handler, Groq timeout pattern, error handling |
| **AI Engine Pydantic model** | `ai-engine/app.py` (lines 366-395) | BaseModel with Optional fields, Field validators |
| **AI Engine helper module** | `ai-engine/rag.py` | Lazy singleton client, thread safety, collection isolation |
| **VS Code extension command** | `vscode-extension/src/extension.ts` | Command registration, SecretStorage, status bar, diagnostics |
| **VS Code webview** | `vscode-extension/src/webviewProvider.ts` | WebviewViewProvider class, CSP, HTML template pattern |
| **GitHub Action** | `github-action/index.js` | Input parsing, Octokit, Groq SDK, PR review posting |
| **Backend test** | `backend/tests/authMiddleware.test.js` | env setup before import, mockReq/mockRes pattern, node:test |
| **AI Engine test** | `ai-engine/tests/test_app.py` | pytest class, conftest mocking, simple assertions |
| **Frontend test** | `frontend/src/store/useStore.test.js` | Vitest describe/it, zustand direct state access |

---

## 14. Summary of Key Patterns

| Pattern | Where Used | File Reference |
|---------|-----------|----------------|
| ES Modules (`"type": "module"`) | Backend, GitHub Action | `backend/package.json` line 6 |
| `.js` extension in imports | Backend | `backend/index.js` lines 12-37 |
| emoji-prefixed console logs | Backend, AI Engine | `backend/index.js` passim |
| Inline styles | Frontend (all components) | All `.tsx` files |
| Glass panel cards | Frontend | `className="glass-panel"` |
| Zustand + localStorage | Frontend state | `frontend/src/store/useStore.ts` |
| Pydantic request/response models | AI Engine | `ai-engine/app.py` lines 366-965 |
| Async Groq with timeout | AI Engine | `ai-engine/app.py` lines 238-253 |
| Singleton database clients | AI Engine (ChromaDB, Groq) | `ai-engine/rag.py` lines 20-36, `app.py` lines 354-363 |
| Per-repo collection isolation | AI Engine (RAG) | `ai-engine/rag.py` lines 39-53 |
| Custom in-memory lock | Backend (AnalysisCache, ReviewQueue) | `backend/utils/analysisCache.js` lines 12-31 |
| Process cleanup on shutdown | Backend | `backend/index.js` lines 340-342 |
| Two-phase queue deletion | Backend (ReviewQueue) | `backend/utils/reviewQueue.js` lines 63-70 |
| Sliding + absolute TTL | Backend (AnalysisCache) | `backend/utils/analysisCache.js` lines 86-110 |
| Webhook dedup (Redis + in-memory) | Backend | `backend/index.js` lines 460-498 |
