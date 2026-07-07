# Coding Conventions

**Analysis Date:** Tue Jul 07 2026

## Naming Patterns

**Files:**
- JavaScript backend utilities: `kebab-case.js` (`secretsScanner.js`, `analysisCache.js`, `authMiddleware.js`)
- TypeScript frontend components: `PascalCase.tsx` (`HealthScoreGauge.tsx`, `MetricsChart.tsx`, `SettingsModal.tsx`)
- TypeScript frontend utilities: `camelCase.ts` (`exportUtils.ts`, `sanitize.ts`)
- Python AI Engine: `snake_case.py` (`text_splitter.py`, `diff_helper.py`, `embeddings.py`)
- Main entry point: `index.js` (backend), `app.py` (AI Engine), `extension.ts` (VS Code)

**Functions:**
- JavaScript/Python: `camelCase` for regular functions (`readFilesRecursively`, `scanSecrets`, `verifyWebhookSignature`)
- React components: `PascalCase` (`Dashboard`, `MermaidViewer`, `SidebarLayout`)
- TypeScript: `camelCase` for hooks (`useDebounce`, `useStore`)

**Variables:**
- JavaScript/Python/TypeScript: `camelCase` throughout
- Constants: `UPPER_SNAKE_CASE` (`MAX_DEPTH`, `MAX_FILES`, `MAX_FILE_SIZE`, `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`)
- Module-level configs: `ALLOWED_ORIGINS`, `ALLOWED_ANALYSIS_MODELS`

**Types:**
- TypeScript interfaces: `PascalCase` (`BackendResponse`, `FileReview`, `ReviewItem`, `AnalysisData`, `ChatMessage`)
- Python Pydantic models: `PascalCase` (`AnalyzeRequest`, `ChatRequest`, `FileItem`, `ReviewDiffRequest`)
- Type aliases for unions: inline in Zustand store

## Code Style

**Formatting:**
- Tool: Prettier (`root .prettierrc`)
- Key settings: `semi: true`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "all"`, `printWidth: 120`
- Editor: `.editorconfig` with `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `utf-8`

**Linting:**
- Tool: ESLint (`root .eslintrc.json`)
- Key rules: `no-unused-vars: warn`, `no-console: off`, extends `eslint:recommended`
- TypeScript: Strict mode in `tsconfig.json` (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)
- Formatting applied via lint-staged on pre-commit (husky)

## Import Organization

**Order (JavaScript/TypeScript):**
1. External library imports (`import express from 'express'`)
2. Internal absolute imports (`import { scanSecrets } from './utils/secretsScanner.js'`)
3. CSS imports (`import './index.css'`)

**Order (Python):**
1. Standard library (`import os`, `import json`)
2. Third-party libraries (`from fastapi import FastAPI`)
3. Internal modules (`from embeddings import is_fallback_active`)

**Path Aliases:**
- TypeScript: None (relative imports throughout, no `@/` alias)
- Python: No project-level aliases, `sys.path` modified only by `pytest.ini` (`pythonpath = .`)

## Error Handling

**Patterns:**
- Backend: `express-async-errors` wrapper at top of `index.js` catches async throw in routes; explicit try/catch with `.catch()` at process level
- Frontend: try/catch with `err: unknown` + instanceof checking; `apiFetch` wraps network errors with timeout detection
- AI Engine: `HTTPException` raised with specific status codes (400, 401, 422, 500, 502, 504); async LLM calls use `_call_groq_with_timeout` for timeout handling

**Fallback patterns:**
- AI Engine offline → mock AI review (`backend/utils/mockAIReview.js`)
- MongoDB offline → file-based analytics (`backend/utils/analyticsStore.js`)
- Redis offline → in-memory fallback maps
- Embedding model unavailable → deterministic hash fallback

## Logging

**Framework:** `console.log` / `console.error` / `console.warn` throughout all modules. No structured logging library.

**Patterns:**
- Emoji prefixes for visual scanning (`🟢`, `❌`, `⚠️`, `📡`, `✅`, `🎉`)
- Backend: Contextual messages with repo URLs and session IDs
- AI Engine: Sanitized error messages (API keys redacted via `_redact_key`)
- GitHub Action: `core.warning` / `core.setFailed` / `console.log`

## Comments

**When to Comment:**
- Security-critical operations have multi-line explanations (see CSRF middleware comments in `index.js`)
- Complex async/race patterns documented inline (ReviewQueue, webhook dedup)
- TODO comments reference issue numbers (`// TODO: Issue #397`)
- Architecture decisions documented inline (e.g., trust proxy setting, keyGenerator rationale)

**JSDoc/TSDoc:**
- Minimal usage in backend; `analysisCache.js` has full JSDoc blocks for all methods
- Python: `docstring` style used in some modules (`embeddings.py`, `diff_helper.py`)
- Frontend: Inline comments only, no JSDoc on most functions

## Function Design

**Size:**
- Backend `index.js` is monolithic (~2203 lines) with all routes + inline helpers
- Utility functions are small and focused (most under 100 lines)
- AI Engine `app.py` is also monolithic (~1037 lines) with all routes

**Parameters:**
- Backend: Object destructuring in route handlers (`const { repoUrl, company, ... } = req.body`)
- Python: Pydantic models with `Optional` fields and `Field` validators
- Named parameters over positional for complex functions

**Return Values:**
- API responses: Structured JSON with `{ success: true, ... }` or `{ error: "..." }`
- Utilities: typed return objects with meaningful field names
- Python: Pydantic `BaseModel` response models for typed API responses

## Module Design

**Exports:**
- Node.js ESM: `export function` / `export default` (all JS modules use `"type": "module"`)
- Python: `def` / `class` at module level
- TypeScript: `export default function Component()` / `export interface`

**Barrel Files:**
- Not used. All imports reference the specific file path.

---

*Convention analysis: Tue Jul 07 2026*
