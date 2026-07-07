# Codebase Structure

**Analysis Date:** Tue Jul 07 2026

## Directory Layout

```
ai-code-reviewer/
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI pipeline: frontend build, GitHub Action build, backend tests, AI Engine tests
├── ai-engine/                     # Python FastAPI AI microservice
│   ├── app.py                     # FastAPI app (~1037 lines): /analyze, /chat, /review-diff, /api/rag/* routes
│   ├── embeddings.py              # SentenceTransformer + deterministic fallback embedding generation
│   ├── rag.py                     # ChromaDB operations: ingest, query, upsert, cleanup, pagination
│   ├── text_splitter.py           # LangChain-based language-aware file chunking
│   ├── diff_helper.py             # Git diff helper: get_changed_files, filter_files_by_changes
│   ├── vectorstore.py             # Legacy file-based vector store (JSON) with atomic persistence
│   ├── conftest.py                # Pytest fixtures
│   ├── pytest.ini                 # Pytest config (pythonpath = .)
│   ├── requirements.txt           # Python dependencies (13 packages)
│   └── tests/                     # AI Engine test suite
├── backend/                       # Node.js Express REST API
│   ├── index.js                   # Main server (~2203 lines): all routes, middleware, helpers
│   ├── auto_github.js             # Standalone issue assignment + PR merge automation script
│   ├── config/
│   │   ├── db.js                  # MongoDB connection with reconnect logic and degraded mode
│   │   └── env.js                 # Environment variable parsing utilities
│   ├── models/
│   │   ├── Analytics.js           # Mongoose schema for review analytics
│   │   └── Session.js             # Mongoose schema for chat sessions with TTL index
│   ├── shared/
│   │   └── dangerousPhrases.js    # Loads shared-safety-config.json for prompt injection defense
│   ├── utils/                     # 23 utility modules
│   │   ├── analysisCache.js       # In-memory LRU cache with SHA256 keying and TTL
│   │   ├── analyticsStore.js      # File-based analytics persistence (JSON) with lock
│   │   ├── authMiddleware.js      # API key validation + HMAC-signed session cookies
│   │   ├── complexityAnalyzer.js  # Static code metrics: lines, comments, functions, complexity grade
│   │   ├── diffParser.js          # Unified diff parser for PR review
│   │   ├── envVerifier.js         # Port verification utility
│   │   ├── fileHelper.js          # Recursive folder deletion, folder size calculation
│   │   ├── githubChecksIntegration.js  # GitHub Checks API integration
│   │   ├── ignoreHelper.js        # .reposageignore file parser + recursive file reader
│   │   ├── incrementalReviewer.js # Incremental review support
│   │   ├── mockAIReview.js        # Fallback mock review when AI Engine is offline
│   │   ├── notebookParser.js      # Jupyter notebook parser
│   │   ├── redisSafe.js           # Redis key sanitization
│   │   ├── repoReader.js          # Repository file reader
│   │   ├── reportGenerator.js     # Report generation utilities
│   │   ├── reposageIgnore.js      # .reposageignore pattern matching
│   │   ├── reviewQueue.js         # Per-key async queue + exclusive lock for serialization
│   │   ├── sanitizeFileContent.js # Prompt injection neutralization + HTML sanitization
│   │   ├── secretsScanner.js      # 15 regex rules for credential detection
│   │   ├── severityConfig.js      # Severity configuration
│   │   ├── signatureVerifier.js   # HMAC-SHA256 webhook signature verification
│   │   ├── skipConstants.js       # Directory skip set (node_modules, .git, etc.)
│   │   └── urlValidator.js        # GitHub URL validation with SSRF prevention
│   ├── tests/                     # 67 test files covering all utilities
│   └── Dockerfile                 # Node.js Docker image
├── frontend/                      # React + Vite + TypeScript SPA
│   ├── src/
│   │   ├── main.tsx               # App entry point
│   │   ├── App.tsx                # Router setup with lazy-loaded Dashboard
│   │   ├── pages/
│   │   │   └── Dashboard.tsx      # Main page: analyze, file browser, results, chat, analytics
│   │   ├── components/            # 11 reusable components
│   │   │   ├── HealthScoreGauge.tsx
│   │   │   ├── MetricsChart.tsx
│   │   │   ├── VulnerabilitiesBarChart.tsx
│   │   │   ├── TotalIssuesKpiCard.tsx
│   │   │   ├── QuickFixButton.tsx
│   │   │   ├── MarkdownErrorBoundary.tsx
│   │   │   ├── CopyToClipboardButton.tsx
│   │   │   ├── DashboardFooter.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── KeyboardShortcutsHelp.tsx
│   │   │   └── AnalyticsDateRangePicker.tsx
│   │   ├── hooks/
│   │   │   └── useDebounce.ts     # Debounce hook for search input
│   │   ├── layouts/
│   │   │   └── SidebarLayout.tsx  # Sidebar navigation + theme toggle
│   │   ├── store/
│   │   │   └── useStore.ts        # Zustand global state: analysisResult, selectedFile, chatHistory
│   │   ├── utils/
│   │   │   ├── api.ts             # API client with session init, CSRF handling, auto-retry
│   │   │   ├── exportUtils.ts     # HTML/PDF/Markdown export triggers
│   │   │   └── sanitize.ts        # Client-side sanitization utilities
│   │   └── index.css              # Global styles with CSS variables
│   ├── vite.config.ts
│   ├── tsconfig.json              # Strict TS config with ES2020 target
│   ├── vitest.config.js           # Vitest configuration
│   └── vercel.json                # Vercel deployment config
├── github-action/                 # GitHub Action for PR review
│   ├── action.yml                 # Action metadata: inputs, branding, node20 runner
│   ├── index.js                   # Main action script (~309 lines)
│   ├── utils/                     # Shared utilities (diffParser, secretsScanner, globToRegex)
│   ├── scripts/                   # Sync scripts for shared code
│   └── dist/                      # Bundled output (via ncc)
├── vscode-extension/              # VS Code extension
│   ├── src/
│   │   ├── extension.ts           # Activation, commands, status bar, SecretStorage
│   │   ├── api.ts                 # API client for backend
│   │   ├── diagnostics.ts         # VS Code diagnostic collection integration
│   │   ├── webviewProvider.ts     # Sidebar webview provider
│   │   └── utils.ts               # Helper utilities
│   ├── esbuild.js                 # Build bundler config
│   └── tsconfig.json
├── docs/
│   └── ARCHITECTURE.md            # RAG pipeline architecture documentation
├── scripts/                       # Automation scripts
├── shared-safety-config.json      # Shared config: dangerous_phrases, homoglyph_map, version
├── docker-compose.yml             # ChromaDB + AI Engine + Backend + Frontend
├── render.yaml                    # Render.com deployment config
├── .editorconfig                  # Editor formatting settings
├── .prettierrc                    # Prettier: semi, singleQuote, tabWidth 2, trailingComma all, printWidth 120
├── .eslintrc.json                 # ESLint: node env, es2022, no-unused-vars warn
├── IMPLEMENTATION_785.md          # API key logging vulnerability fix doc
├── IMPLEMENTATION_787.md          # IDOR vulnerability fix doc
├── GOOD_FIRST_ISSUES.md           # Contributor onboarding tasks (16 items)
├── SECURITY.md                    # Minimal security policy
├── ROADMAP.md                     # Project roadmap (5 phases)
├── CHANGELOG.md                   # Changelog
├── CONTRIBUTING.md                # Contribution guidelines
└── API.md                         # API documentation
```

## Directory Purposes

**`ai-engine/`:**
- Purpose: Python FastAPI microservice for LLM-powered code analysis, RAG pipeline, and content sanitization
- Contains: FastAPI routes, embedding models, ChromaDB integration, text splitters
- Key files: `app.py` (all API routes), `rag.py` (ChromaDB operations), `embeddings.py` (vector generation)

**`backend/`:**
- Purpose: Node.js Express API server - the central orchestrator for all client requests
- Contains: HTTP routes, GitHub API integration, security scanning, complexity analysis, repo cloning, report generation, database models
- Key files: `index.js` (server entry point, all routes), `utils/` (23 utility modules)

**`frontend/src/`:**
- Purpose: React SPA for repository analysis dashboard and AI chat
- Contains: Pages, components, state management, API client utilities
- Key files: `pages/Dashboard.tsx` (main application page), `utils/api.ts` (API client)

**`github-action/`:**
- Purpose: Standalone GitHub Action that runs PR reviews without needing the backend server
- Contains: Action entry point, Groq SDK integration, diff parsing, secret scanning
- Key files: `action.yml`, `index.js`, `dist/index.js` (bundled output)

**`vscode-extension/src/`:**
- Purpose: VS Code extension for in-editor code review
- Contains: Extension entry point, API client, diagnostics provider, webview panel
- Key files: `extension.ts` (activation + commands)

## Naming Conventions

**Files:**
- JavaScript: `kebab-case.js` (backend utils: `secretsScanner.js`, `analysisCache.js`)
- TypeScript: `PascalCase.tsx` for components (`HealthScoreGauge.tsx`), `camelCase.ts` for utilities (`exportUtils.ts`)
- Python: `snake_case.py` (`text_splitter.py`, `diff_helper.py`)
- Mixed: Dashboard uses `PascalCase` for component files, but some utilities use `kebab-case`

**Directories:**
- Lowercase singular: `utils/`, `config/`, `models/`, `pages/`, `components/`, `hooks/`, `layouts/`, `store/`

## Where to Add New Code

**New Feature (Frontend):**
- Page: `frontend/src/pages/` or extend `Dashboard.tsx`
- Component: `frontend/src/components/`
- State: `frontend/src/store/useStore.ts`
- API call: `frontend/src/utils/api.ts`

**New Feature (Backend):**
- Route: `backend/index.js` (or preferably extract into `backend/routes/` directory)
- Utility: `backend/utils/`
- Model: `backend/models/`
- Config: `backend/config/`

**New Feature (AI Engine):**
- Route: `ai-engine/app.py`
- Utility: New file in `ai-engine/`
- RAG operation: `ai-engine/rag.py`

**New Feature (GitHub Action):**
- Action: `github-action/index.js`
- Utility: `github-action/utils/`

**New Feature (VS Code Extension):**
- Extension: `vscode-extension/src/extension.ts`
- Provider: `vscode-extension/src/`

**Tests:**
- Backend: `backend/tests/` (co-located, one file per utility)
- Frontend: `frontend/src/` co-located with source (e.g., `useStore.test.js`, `exportUtils.test.js`)
- AI Engine: `ai-engine/tests/`
- VS Code Extension: `vscode-extension/src/test/`

## Special Directories

**`github-action/dist/`:**
- Purpose: Bundled JavaScript output for the GitHub Action
- Generated: Yes (via `ncc build`)
- Committed: Yes (required for GitHub Action to work)

**`backend/temp_repos/`:**
- Purpose: Temporary cloned repositories during analysis
- Generated: Yes (at runtime)
- Committed: No (gitignored, cleaned on shutdown)

**`backend/tests/fixtures/`:**
- Purpose: Test fixture data
- Generated: No
- Committed: Yes

**`ai-engine/data/`:**
- Purpose: Persistent storage for legacy vector store (JSON file)
- Generated: Yes (at runtime)
- Committed: No (gitignored)

---

*Structure analysis: Tue Jul 07 2026*
