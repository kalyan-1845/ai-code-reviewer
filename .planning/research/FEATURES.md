# Features Research: RepoSage

## Completed Features (Phases 1-3)

### ✅ AI Code Review (Phase 1)
- LLM-powered bug detection, anti-pattern analysis, performance bottleneck identification
- Supports 13+ languages: Python, JavaScript, TypeScript, Java, Go, Rust, C++, C#, PHP, Ruby, SQL, HTML, CSS
- Batch processing with configurable batch size (1-20 files)
- Diff-only review mode for PRs
- Custom system prompt support with prompt injection defense

### ✅ README Generation (Phase 1)
- Automatic README.md generation for analyzed repositories
- Mermaid.js architecture diagram generation
- Company persona and language customization

### ✅ Security Scanner (Phase 2)
- Regex-based credential detection (15+ patterns)
  - AWS Access Keys, GitHub PATs, Stripe keys, Google API keys
  - Database connection strings, Slack webhooks
  - Private keys, JWTs, Twilio credentials
  - Ethereum/Bitcoin wallet addresses
  - Hardcoded IPv4 addresses
  - Generic API keys and tokens
- Secrets scanning on PR diffs (backend + GitHub Action both have this)
- Configurable line length limits for scanning

### ✅ Complexity Metrics (Phase 2)
- Lines of Code, Comment Lines, Empty Lines per file
- Function Count, Complexity Grade (A-F)
- Per-file and aggregate metrics

### ✅ AI Chat With Repository (Phase 3)
- Natural language Q&A about codebases
- Session-based context persistence (MongoDB)
- File relevance scoring (keyword matching for context selection)
- RAG-enhanced responses (when vector store is available)

### ✅ GitHub Action PR Bot (Phase 3)
- Inline line-by-line review comments on PRs
- Automated approval when no issues found
- Exclude patterns via glob, custom extension lists
- Auto-label PRs with `gssoc:approved`

### ✅ Report Export (Phase 2)
- HTML report export with dark theme styling
- PDF report generation via PDFKit
- Filtered by category (bugs, security, optimization, styling)

### ✅ Analytics & History (Phase 3)
- MongoDB-persisted analysis records
- 30-day trend data (health scores, findings count)
- Review history with pagination
- Cross-review comparison

---

## In-Progress Features (Phase 4 - Community & Scale)

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 1 | Dashboard Audit History | 📋 Planned | High |
| 2 | PDF Report Export | 📋 Planned | High |
| 3 | `.reposageignore` Config Support | 📋 Planned | High |
| 4 | AI Settings Modal | 📋 Planned | Medium |
| 5 | File Composition Charts | 📋 Planned | Medium |
| 6 | Multi-repo Batch Analysis | 📋 Planned | Low |
| 7 | CI/CD Pipeline Integration (GitLab/Jenkins) | 📋 Planned | Low |
| 8 | Plugin Architecture | 📋 Planned | Low |
| 9 | Auto-Remediation (One-Click Fixes) | 📋 Planned | Low |
| 10 | Unit Test Generator | 📋 Planned | Low |
| 11 | Semantic Code Search | 📋 Planned | Medium |

## Active GSSoC Epics (Phase 5)

| # | Feature Epic | Status | Description |
|---|--------------|--------|-------------|
| 1 | VS Code Extension | 🚀 Active | Native IDE integration (45 issues across 3 epics) |
| 2 | AI RAG (Vector DB) System | 🚀 Active | ChromaDB-powered semantic code search |
| 3 | Multi-Repo Analytics Dashboard | 🚀 Active | Engineering manager tracking dashboard |
| 4 | Team Collaboration Workspace | 📋 Planned | Shared workspaces |
| 5 | RBAC Access Controls | 📋 Planned | Role-based access |
| 6 | SARIF/SAST Format Export | 📋 Planned | Industry-standard security formats |

---

## Security & Safety Features

### Prompt Injection Defense
1. **Dangerous phrase detection**: 40+ phrases filtered in both backend and AI engine
2. **Homoglyph detection**: Cyrillic/Greek confusable character detection (>30% threshold)
3. **Code fence extraction**: LLM output sanitized via bleach with allowlist
4. **Mermaid code sanitization**: HTML/js injection prevention in diagram generation
5. **System prompt validation**: NFKC normalization, zero-width char stripping, length limits

### CSRF Protection
- Token-based CSRF with HMAC-signed cookies
- Token rotation with grace period for concurrent requests
- In-memory token store (WARNING: not distributed-safe)

### Rate Limiting
- `/api/analyze`: 5 requests per 5 minutes
- `/api/chat`: 30 requests per minute
- `/api/webhook`: 10 requests per minute
- `/api/issues/create`: 10 per minute
- Per-repository webhook rate limiting (5 per minute)
- AI Engine: 500 requests per minute per IP

### Session Security
- HMAC-signed session cookies (SHA-256)
- Session ownership tokens (prevents IDOR)
- MongoDB TTL-based expiry (30 min creation, 24h max extension)
- ReviewQueue serializes chat requests per session

---

## Anti-Features (What RepoSage Deliberately Does NOT Do)

1. **No local LLM support** — All AI inference goes through Groq Cloud API
2. **No file editing** — Read-only analysis, no auto-fix PRs yet
3. **No user authentication system** — API-key based, no multi-user auth
4. **No real-time collaboration** — Single-user session model
5. **No SQL database** — MongoDB only (document store)
6. **No GPU/ML infrastructure** — All AI compute is external
