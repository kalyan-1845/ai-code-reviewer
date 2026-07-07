# Stack Research: RepoSage

## Overview

RepoSage is a polyglot monorepo split across **4 production modules** + 1 active GSSoC epic extension. The stack was chosen to enable a three-tier architecture: React frontend → Node.js Express backend → Python FastAPI AI engine, with LLM inference via Groq API.

---

## Core Technologies

### Frontend: React 19 + Vite 8 + TypeScript 6
| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| React | 19.2.6 | UI framework | Latest stable with concurrent features |
| Vite | 8.0.12 | Build tool & dev server | Fast HMR, ESM-native |
| TypeScript | 6.0.2 | Type safety | Required for maintainability at scale |
| react-router-dom | 7.18.0 | Client-side routing | SPA navigation with lazy loading |
| zustand | 5.0.14 | State management | Lightweight, TypeScript-first store |
| recharts | 3.8.1 | Charts | Analytics dashboard visualizations |
| lucide-react | 0.475.0 | Icons | Consistent, tree-shakable icon set |
| mermaid | 11.15.0 | Diagrams | Architecture visualization in reports |
| dompurify | 3.2.4 | XSS prevention | Sanitize AI-generated HTML output |

### Backend: Node.js 18+ / Express 4
| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| Express | 4.21.2 | HTTP server | De facto standard, middleware ecosystem |
| Mongoose | 9.7.1 | MongoDB ODM | Session persistence, analytics storage |
| simple-git | 3.27.0 | Git operations | Repo cloning for analysis |
| @octokit/rest | 22.0.1 | GitHub API | PR reviews, issue creation, webhooks |
| express-rate-limit | 8.5.2 | Rate limiting | Per-IP/per-repo throttle |
| ioredis | 5.3.2 | Distributed caching | Optional Redis for rate-limit/cache |
| pdfkit | 0.19.0 | PDF generation | Export audit reports as PDF |
| cookie-parser | 1.4.7 | Cookie handling | CSRF token and session management |

### AI Engine: Python 3.10+ / FastAPI
| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| FastAPI | 0.115.8 | Async API server | Native async, Pydantic validation |
| uvicorn | 0.34.0 | ASGI server | Production-grade async server |
| groq | 0.18.0 | LLM inference | Llama 3 / DeepSeek / Gemma via Groq Cloud |
| chromadb | 1.5.9 | Vector database | RAG pipeline for semantic code search |
| bleach | 6.2.0 | HTML sanitization | Clean LLM output to prevent XSS |
| langchain-text-splitters | 0.3.6 | Text chunking | Language-aware code splitting |
| sentence-transformers | (all-MiniLM-L6-v2) | Embeddings | 384-dim vector embeddings for RAG |
| httpx | 0.28.1 | Async HTTP | FastAPI test client |

### GitHub Action: Standalone JS Runner
| Technology | Version | Purpose |
|------------|---------|---------|
| @actions/core | 1.10.1 | GitHub Actions toolkit |
| @actions/github | 6.0.0 | Octokit client for PR review posting |
| groq-sdk | 0.18.0 | Direct Groq API calls (no backend dependency) |

### VS Code Extension
| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.3.3 | Extension language |
| esbuild | 0.25.3 | Bundler for VS Code extension |
| mocha + chai | latest | Test framework |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker Compose | Local dev orchestration (4 services) |
| ChromaDB (chromadb/chroma) | Vector database container |
| MongoDB | Session/analytics persistence |
| Redis (optional) | Distributed rate limiting, webhook dedup |

---

## Architecture Summary

```
Frontend (React 19 + Vite 8) → Backend (Express 4) → AI Engine (FastAPI)
                                                          ↓
                                                     Groq Cloud API
                                                          ↓
                                                     ChromaDB (RAG)
```

- **Frontend** never calls AI Engine directly — all traffic goes through Express backend
- **Backend** acts as API gateway: auth, rate limiting, CSRF, caching, and orchestration
- **AI Engine** is stateless except for ChromaDB vector store
- **GitHub Action** is fully independent — bundled JS with its own Groq SDK client
- **VS Code Extension** calls the Backend API for file reviews

---

## Key Version Requirements

- **Node.js >= 18** (ESM modules, fetch API)
- **Python >= 3.10** (structural pattern matching, type hints)
- **npm >= 9** (workspaces support)
- **TypeScript 5+** (frontend uses 6.0.2)
- **MongoDB** required for production (degraded mode without it)
- **Groq API key** mandatory for AI features (no other LLM provider supported)
- **Git** required (for repo cloning operations)
