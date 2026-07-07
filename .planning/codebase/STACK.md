# Technology Stack

**Analysis Date:** Tue Jul 07 2026

## Languages

**Primary:**
- JavaScript (Node.js) - Backend API (`backend/`), GitHub Action (`github-action/`), root tooling
- TypeScript 6.0 - Frontend React app (`frontend/`), VS Code Extension (`vscode-extension/`)
- Python 3.11+ - AI Engine microservice (`ai-engine/`)

**Secondary:**
- HTML/CSS - Frontend UI (`frontend/src/index.css`, `frontend/index.html`)
- YAML - GitHub Actions workflows, Docker Compose, Render deployment config

## Runtime

**Environment:**
- Node.js 20+ (Backend, GitHub Action)
- Python 3.10+ (AI Engine)
- VS Code ^1.85.0 (Extension host)

**Package Managers:**
- npm - Root, `backend/`, `frontend/`, `github-action/`, `vscode-extension/`
- pip - `ai-engine/`
- Lockfiles: `package-lock.json` in each JS module, no lockfile for Python

## Frameworks

**Core:**
- Express 4.21 - Backend REST API (`backend/index.js`)
- FastAPI 0.115 - AI Engine HTTP service (`ai-engine/app.py`)
- React 19.2 - Frontend UI (`frontend/src/`)
- Vite 8.0 - Frontend build tool and dev server (`frontend/vite.config.ts`)

**Testing:**
- Vitest 2.1 - Frontend unit tests (`frontend/vitest.config.js`)
- pytest 8.3 - AI Engine tests (`ai-engine/`)
- c8 11.0 - Backend code coverage (`backend/package.json`)
- Mocha 10.3 - VS Code Extension tests (`vscode-extension/`)
- Chai 4.4 - Assertions for VS Code extension tests

**Build/Dev:**
- Vite 8.0 - Frontend bundler
- esbuild 0.25 - VS Code Extension bundler (`vscode-extension/esbuild.js`)
- @vercel/ncc 0.38 - GitHub Action bundler (`github-action/`)
- nodemon 3.1 - Backend hot-reload
- Husky 9.1 - Git hooks

## Key Dependencies

**Critical - Backend (`backend/package.json`):**
- `express@^4.21.2` - HTTP server and routing
- `@octokit/rest@^22.0.1` - GitHub API client for PR review, issue creation, repo operations
- `mongoose@^9.7.1` - MongoDB ODM for sessions and analytics
- `simple-git@^3.27.0` - Git clone operations
- `ioredis@^5.3.2` - Redis client for distributed rate limiting and webhook deduplication
- `express-rate-limit@^8.5.2` - Per-IP rate limiting
- `rate-limit-redis@^4.2.0` - Redis-backed rate limit store
- `pdfkit@^0.19.0` - PDF report generation
- `js-yaml@^4.1.0` - YAML parsing for config files
- `dotenv@^16.4.7` - Environment variable loading
- `cors@^2.8.5` - CORS middleware
- `cookie-parser@^1.4.7` - Cookie parsing for CSRF tokens
- `lodash.escape@^4.0.1` - HTML escaping for report generation

**Critical - Frontend (`frontend/package.json`):**
- `react@^19.2.6` - UI framework
- `react-dom@^19.2.6` - React DOM renderer
- `react-router-dom@^7.18.0` - Client-side routing
- `zustand@^5.0.14` - State management
- `lucide-react@^0.475.0` - Icon library
- `recharts@^3.8.1` - Charting library for analytics
- `mermaid@^11.15.0` - Architecture diagram rendering
- `dompurify@^3.2.4` - XSS sanitization

**Critical - AI Engine (`ai-engine/requirements.txt`):**
- `fastapi==0.115.8` - HTTP framework
- `uvicorn==0.34.0` - ASGI server
- `groq==0.18.0` - Groq LLM API client
- `chromadb==1.5.9` - Vector database for RAG
- `langchain-text-splitters==0.3.6` - Text chunking
- `pydantic==2.10.6` - Request/response validation
- `bleach==6.2.0` - HTML sanitization (XSS prevention)
- `httpx==0.28.1` - HTTP client (for embedding fallback)

**Critical - GitHub Action (`github-action/package.json`):**
- `@actions/core@^1.10.1` - GitHub Actions toolkit
- `@actions/github@^6.0.0` - GitHub Actions context/Octokit
- `groq-sdk@^0.18.0` - Groq LLM API client

**Infrastructure:**
- MongoDB 7 (via `mongoose`) - Session storage, analytics persistence
- ChromaDB (via `chromadb` Python client) - Vector store for RAG
- Redis (optional via `ioredis`) - Distributed rate limiting, webhook dedup
- Docker Compose - Local development orchestration (`docker-compose.yml`)

## Configuration

**Environment:**
- Backend: `backend/.env` (copied from `backend/.env.example`)
- AI Engine: `ai-engine/.env` (also falls back to `backend/.env`)
- Frontend: `frontend/.env` (copied from `frontend/.env.example`)
- Root: `.editorconfig`, `.prettierrc`, `.eslintrc.json`

**Key env vars required:**
- `GROQ_API_KEY` - Groq LLM API key (Backend and AI Engine)
- `REPOSAGE_API_KEY` - Internal API key for module-to-module auth
- `GITHUB_PAT` - GitHub Personal Access Token
- `WEBHOOK_SECRET` - GitHub webhook secret
- `SESSION_SECRET` - Session cookie signing secret
- `MONGODB_URI` - MongoDB connection string

## Platform Requirements

**Development:**
- Node.js >= 18, npm >= 9
- Python >= 3.10, pip
- Git
- Docker (optional, for ChromaDB/MongoDB)

**Production:**
- Render.com (via `render.yaml`) - Backend and AI Engine hosting
- Vercel (via `frontend/vercel.json`) - Frontend hosting
- GitHub Actions - CI pipeline and Action runner

---

*Stack analysis: Tue Jul 07 2026*
