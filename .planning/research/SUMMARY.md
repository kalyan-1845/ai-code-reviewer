# Project Research Summary

**Project:** RepoSage — AI-Powered Developer Copilot
**Domain:** Developer Tools / AI Code Review & Repository Intelligence
**Researched:** 2026-07-07
**Confidence:** HIGH

## Executive Summary

RepoSage is an open-source, multi-service AI developer copilot that automates code review, security scanning, documentation generation, and repository intelligence. It follows a proven three-tier architecture — React 19 frontend, Node.js/Express backend, Python/FastAPI AI engine — with an independent GitHub Action bot and an early-stage VS Code extension. The product is part of GSSoC '26 and has 45+ granular issues across 3 major architectural epics. **In the competitive landscape, RepoSage's unique advantage is being the only top-10 AI code review tool that is simultaneously open-source, self-hostable, and free** — CodeRabbit (market leader) is proprietary at $24/user/mo, and PR-Agent (closest open-source competitor) lacks a dashboard, chat, and IDE extension.

The codebase is **production-ready** for Phases 1-3 (MVP, Core Enhancements, Advanced Features) and actively being extended in Phase 4 (Community & Scale) and Phase 5 (GSSoC Epics). The architecture is well-structured with strong security practices — CSRF protection with token rotation, multi-layer prompt injection defense, rate limiting on all expensive endpoints, session ownership tokens for IDOR prevention, and HTML sanitization with allowlist — but has known technical debt: duplicated logic between the backend and GitHub Action (secrets scanner, diff parser, dangerous phrases), in-memory state stores that prevent horizontal scaling (CSRF tokens, analysis cache, webhook dedup), an unwired `repoReader.js` module, and a monolithic ~2203-line `backend/index.js` that combines all routes, middleware, and business logic. The backend has excellent test coverage (67 test files covering all utilities), but the frontend lacks component tests and the AI Engine tests run with `continue-on-error: true` in CI.

**Key recommendation:** Execute the three GSSoC epics (RAG hardening, VS Code extension, Analytics Dashboard) in parallel while systematically addressing the scaling blockers — migrate CSRF store and analysis cache to Redis, automate GitHub Action sync from `shared-safety-config.json`, and enforce AI Engine tests in CI. Defer the most architecturally complex Phase 4 features (plugin architecture, auto-remediation) to post-GSSoC. The competitive priority should be closing the review quality gap with CodeRabbit (F1 51.2%) through systematic benchmarking and per-repo tuning.

**Key risks:** (1) In-memory CSRF and cache stores prevent multi-instance deployments — documented in code as known issues, (2) GitHub Action duplicates security logic from backend with no automated sync enforcement — security rules will drift, (3) MongoDB failure crashes production server with no auto-reconnect, (4) Single LLM provider (Groq) with no fallback — all AI features depend on Groq availability, (5) RAG embedding model has a deterministic fallback mode that produces zero vectors, making semantic search useless when the model is unavailable, (6) No frontend component tests — UI regressions undetected.

---

## Key Findings

### From Stack Research (2 independent analyses confirm)

**Stack is validated and appropriate:**

| Layer | Technology | Purpose | Verified By |
|-------|-----------|---------|-------------|
| Frontend | React 19 + Vite 8 + TypeScript 6 | UI framework | package.json, vite.config.ts |
| Backend | Express 4 + ESM + Mongoose 9 | API gateway + persistence | package.json, index.js |
| AI Engine | FastAPI 0.115 + Uvicorn | LLM orchestration + RAG | requirements.txt, app.py |
| LLM | Groq Cloud (4 models) | AI inference | .env.example, app.py |
| Vector DB | ChromaDB 1.5.9 | RAG storage | docker-compose.yml, rag.py |
| Cache | Redis (optional) | Distributed state | backend/index.js |
| Build | Vite 8 / ncc / esbuild | Packaging | Multiple configs |

**Critical version requirements:**
- Node.js ≥ 18 (ESM modules, native fetch), Python ≥ 3.10, MongoDB required for production
- TypeScript 6.0.2 in frontend — newer than typical projects; verify library compatibility
- All LLM traffic goes through Groq Cloud only — no local inference, no OpenAI/Anthropic fallback
- ChromaDB pinned to 1.5.9 — upgrade risk for RAG pipeline

### From Competitive Landscape Research

**Market Position:**
- RepoSage is in the **"Hybrid" category** (LLM + deterministic scanning), competing with CodeRabbit (market leader, $24/user/mo, proprietary) and PR-Agent (closest open-source rival, Apache 2.0)
- **Unique advantage: MIT-licensed, self-hostable, free** — no other top-10 tool offers all three
- **Biggest gap: Review quality** — CodeRabbit's F1 score is 51.2% (Martian Benchmark); RepoSage has no systematic quality measurement
- **Biggest opportunity: RAG-enhanced code understanding** — Greptile does this well but is SaaS-only; RepoSage's open-source RAG epic could match it at $0 cost

**Strategic recommendations from competitive analysis:**
1. Short-term: Focus on RAG quality to differentiate on codebase understanding
2. Medium-term: Add Semgrep integration for SAST parity with CodeRabbit
3. Long-term: Build per-repo tuning ("Learnings") and PR summary depth

### From Architecture Research (2 independent analyses confirm)

**5 Modules with clear responsibilities:**

1. **Backend** (`backend/`) — Express 4 API gateway, 15+ routes, 2203 lines in `index.js` + 23 utility modules. Middleware stack: CORS → cookieParser → CSRF → rate-limit → routes → error handler. 67 test files.

2. **AI Engine** (`ai-engine/`) — FastAPI proxy, 1037 lines in `app.py` + 5 supporting modules (embeddings, rag, text_splitter, diff_helper, vectorstore). LLM calls via Groq with JSON schema enforcement.

3. **Frontend** (`frontend/`) — Single-page React app, 1 page (Dashboard.tsx), 11 components, zustand state store, lazy-loaded routing.

4. **GitHub Action** (`github-action/`) — Standalone JS, direct Groq SDK + Octokit, bundled via ncc. Duplicates backend logic (diff parser, secrets scanner, dangerous phrases).

5. **VS Code Extension** (`vscode-extension/`) — Early stage, 4 source files (extension.ts, api.ts, diagnostics.ts, webviewProvider.ts).

**Key architectural patterns identified by all agents:**
- Backend is the sole entry point for frontend traffic (never calls AI Engine directly)
- Graceful degradation at every layer (MongoDB → file, AI Engine → mock, Redis → in-memory, ChromaDB → skip)
- Session isolation for chat via MongoDB TTL + ReviewQueue + ownership tokens
- Webhook dedup at delivery and SHA levels (Redis + in-memory fallback)
- Analysis cache avoids redundant LLM calls (in-memory LRU with SHA256 keying)

**Known anti-patterns (identified by multiple agents):**
- Monolithic `backend/index.js` (2203 lines) — should use Express Router for route separation
- Monolithic `ai-engine/app.py` (1037 lines) — should split into route modules
- In-memory state stores across all agents (CSRF, cache, dedup, rate limits)
- `any` type catch clauses in frontend (issue #1291)

### From Features Research

**Currently delivered (Phases 1-3, 100% complete):**
- AI code review (13+ languages, batch processing, diff-only mode)
- README + Mermaid architecture diagram generation
- Security scanner (15 regex patterns for credentials, keys, wallets, IPs, crypto addresses)
- Complexity metrics (LOC, comment density, function count, grade A-F)
- AI chat with repository (session-based, keyword file selection, RAG-enhanced)
- GitHub Action PR bot (inline comments, auto-approval, glob exclusions)
- HTML and PDF report export
- Analytics trends, review history, cross-review comparison

**In progress (Phase 4):** 11 features planned — audit history, `.reposageignore` support, AI settings modal, file composition charts, multi-repo batch analysis, CI/CD integrations, plugin architecture, auto-remediation, unit test generator, semantic code search.

**Active GSSoC epics (Phase 5):** VS Code Extension, RAG system hardening, Multi-Repo Analytics Dashboard, Team Workspaces, RBAC, SARIF export.

**Security features are extensive:** Prompt injection defense (40+ phrases, homoglyph detection, NFKC normalization), CSRF with HMAC-signed tokens + rotation + grace period, rate limiting on all expensive endpoints, bleach HTML sanitization, Mermaid code sanitization, session ownership tokens (IDOR prevention), webhook HMAC verification.

### From Testing Research

**Test distribution:**
| Module | Framework | Test Files | Coverage |
|--------|-----------|------------|----------|
| Backend | c8 + Node test runner | 67 | Full utility coverage |
| Frontend | Vitest 2.1 | 4 | Minimal (store, hooks, utils only) |
| AI Engine | pytest 8.3 | Unknown | Runs with `continue-on-error: true` |
| VS Code Extension | Mocha 10.3 + Chai | Minimal | Early stage |

**Backend test coverage is excellent** — 67 test files covering all 23 utility modules, including edge-case-specific files (e.g., `complexityAnalyzerEdgeCases.test.js`, `secretsScannerEdgeCases.test.js`).

**Critical gaps:**
- AI Engine tests run but **don't block CI** (continue-on-error: true)
- No frontend component tests for Dashboard.tsx or any of the 11 components
- No end-to-end tests for the full analyze pipeline
- No integration tests for webhook PR review flow (hard to mock GitHub)

### From Pitfalls/Concerns Research

**Critical issues (all confirmed by multiple agents):**

1. **In-memory CSRF token store** — blocks horizontal scaling. Migrate to Redis.
2. **In-memory analysis cache** — each instance has its own cache. Migrate to Redis.
3. **GitHub Action duplicates backend logic** — dangerous phrases, secrets scanner, diff parser. No automated sync enforcement.
4. **`repoReader.js` unwired** — prepared module with tests but no consumers. Risk of duplication.
5. **MongoDB failure crashes production** — server exits on DB failure. Add auto-reconnect.
6. **Single LLM provider (Groq)** — no fallback. Abstract behind an interface.
7. **No structured logging** — console.log/error throughout. Cannot route to centralized systems.
8. **Temp repo cleanup not guaranteed** on crash (issue #397).
9. **`validate_system_prompt` fails to strip multiple dangerous phrases** (issue #395).

**Moderate concerns:**
- Session TTL design (30 min creation, 24h max extension) — needs review
- Model allowlist hardcoded in backend — should be configurable
- Frontend has `any` type catch clauses (issue #1291)
- API docs (`API.md`) are incomplete — only cover a subset of endpoints
- AI Engine `/analyze` lacks per-client rate limit (only global 500/min per-IP)
- Secrets scanner regex can have false positives/negatives
- ChromaDB pinned to 1.5.9 — migration risk
- `contribs.json`, `vars.json`, `prs.txt`, `test.py` clutter root directory

---

## Implications for Roadmap

### Suggested Phase Structure

Based on combined research from all agents, I suggest the following phase structure:

---

### Phase 4A: Foundation Hardening (Current — High Priority)
**Rationale:** Before adding more features, fix the scaling and maintenance blockers. These issues are identified by ALL research agents and will compound as more contributors join and more features stack on.

**Delivers:** Distributed-safe backend, reduced code duplication, reliable MongoDB failover

**Addresses from FEATURES.md:** Technical debt cleanup (implicit)

**Avoids from PITFALLS.md/CONCERNS.md:**
- CSRF → Redis migration (P1)
- Analysis cache → Redis migration (P4)
- GitHub Action sync automation (P3)
- MongoDB auto-reconnect in production (P5)
- Session TTL review (M1)
- `repoReader.js` integration or archival (P2)
- Extract backend routes from monolithic `index.js`
- Extract AI Engine routes from monolithic `app.py`

**Research flag:** 🔬 Needs research — Redis migration strategy, shared code extraction approach (npm package vs. CI sync script vs. runtime fetch)

**Input from competitive analysis:** Foundation hardening is invisible to users but essential for the GSSoC contributor pipeline — 45+ contributors will need a stable, scalable platform.

---

### Phase 4B: Community Features
**Rationale:** After scaling blockers are resolved, deliver the highest-value Phase 4 features that the community needs most. These features have well-documented patterns in the existing codebase.

**Delivers:**
- Dashboard audit history with timeline view (uses existing `Analytics` collection)
- `.reposageignore` support (hooks into existing `ignoreHelper.js`)
- AI settings modal (connects to existing `systemPrompt`, `model`, `temperature` params)
- File composition charts (builds on existing `recharts` dependency)
- Semantic code search (extends existing RAG query endpoint)

**Addresses from FEATURES.md:** Phase 4 items 1-4, 11

**Avoids from PITFALLS.md/CONCERNS.md:**
- M5 (add frontend tests alongside these features)
- m2 (add Python linting to AI Engine)
- M6 (update API docs for new endpoints)

**Research flag:** ⚡ Standard patterns — skip research phase. The existing code shows all patterns clearly.

**Input from competitive analysis:** `.reposageignore` and AI settings modal address CodeRabbit's `.coderabbit.yaml` tuning advantage — per-repo configurability is a competitive requirement.

---

### Phase 5A: RAG System Hardening (Active GSSoC Epic — Run in Parallel)
**Rationale:** The RAG pipeline is functional but needs production hardening. The fallback embedding mode produces zero vectors, making semantic search useless when sentence-transformers is unavailable.

**Delivers:**
- Production-grade embedding service (eliminate fallback mode)
- Cross-repo RAG isolation (collection per repo via SHA256 suffix already implemented)
- Automated stale chunk cleanup on re-analysis
- Performance optimization for large repos
- Embedding model reliability monitoring

**Addresses from FEATURES.md:** Phase 5 item 2 (AI RAG System)

**Avoids from PITFALLS.md/CONCERNS.md:**
- ChromaDB dependency risk (M2 — abstract behind interface)
- Model config centralization (needed for embedding model)

**Integration notes:** Pipeline already works (split → ingest → query). Gaps are around monitoring, error handling, and embedding service reliability.

**Research flag:** 🔬 Needs research — Evaluate ChromaDB clustering for larger scale, embedding model alternatives, sentence-transformers deployment model (separate container vs. in-process)

**Input from competitive analysis:** RAG quality is RepoSage's biggest differentiator opportunity — Greptile charges $20/user/mo for codebase understanding that RepoSage could offer for free.

---

### Phase 5B: VS Code Extension (Active GSSoC Epic — Run in Parallel)
**Rationale:** Extension is in early stages — needs activation, error handling, and UX hardening before community contributions scale.

**Delivers:**
- Production-ready VS Code extension with:
  - File review command (implemented, needs hardening)
  - Inline diagnostics (implemented, needs testing)
  - Sidebar webview (implemented, needs polish)
  - API key configuration (implemented, needs validation UX)
  - Status bar indicators (implemented)

**Addresses from FEATURES.md:** Phase 5 item 1

**Avoids from PITFALLS.md/CONCERNS.md:**
- No extension test suite — must add Mocha/Chai tests
- API key storage security — SecretStorage already implemented correctly

**Integration notes:** Extension calls `POST /api/analyze-file` — this endpoint already exists and is functional. No AI Engine dependency.

**Research flag:** ⚡ Standard patterns — VS Code extension patterns are well-documented. Skip research phase.

**Input from competitive analysis:** IDE integration is a competitive requirement — CodeRabbit and Copilot both have it. RepoSage's VS Code extension fills a critical gap.

---

### Phase 5C: Multi-Repo Analytics Dashboard (Active GSSoC Epic — Run in Parallel)
**Rationale:** The analytics infrastructure exists (MongoDB, trends endpoint, review history) — this epic is primarily a frontend visualization effort.

**Delivers:**
- Multi-repo overview with aggregate metrics
- Cross-repo trend comparison
- Engineering manager dashboard
- PDF/CSV export of analytics

**Addresses from FEATURES.md:** Phase 5 item 3

**Avoids from PITFALLS.md/CONCERNS.md:**
- M6 (API docs must include analytics endpoints)
- Add frontend component tests alongside new components

**Architecture context:** Backend endpoints exist (`/api/analytics/trends`, `/api/review-history`). Frontend has `recharts`, `HealthScoreGauge`, `MetricsChart`, `VulnerabilitiesBarChart` ready for expansion.

**Research flag:** ⚡ Standard patterns — dashboard patterns are well-documented. Skip research phase.

---

### Phase 4C/5+: Advanced Features (Deferred to Post-GSSoC)
**Rationale:** These features require more architectural design and should not block the GSSoC program.

**Delivers when ready:**
- Multi-repo batch analysis (needs queue management)
- Plugin architecture (needs design RFC — identified as the most architecturally complex)
- Auto-remediation / one-click fixes (needs write permissions design)
- Unit test generation (needs language-specific generators)
- Team collaboration workspace (needs auth infrastructure)
- RBAC access controls (needs user model)
- SARIF/SAST format export (needs schema mapping)

**Addresses from FEATURES.md:** Phase 4 items 6-10, Phase 5 items 4-7

**Research flag:** 🔬 Needs research for each — especially plugin architecture (design RFC needed), auto-remediation (GitHub API permissions), and RBAC (auth model).

**Input from competitive analysis:** SAST parity with CodeRabbit (Semgrep integration) should be prioritized over plugin architecture — it directly improves security coverage.

---

### Phase Ordering Rationale

1. **Foundation first** (Phase 4A) because in-memory CSRF/cache and duplicated security logic are reliability + security issues that affect ALL subsequent work and 45+ GSSoC contributors
2. **GSSoC epics run in parallel** (Phases 5A, 5B, 5C) — they have independent code paths (AI Engine, VS Code, Frontend) and can be assigned to different contributor groups
3. **Community features** (Phase 4B) run alongside or after 4A — they deliver immediate user value with well-understood patterns
4. **Advanced features** (Phase 4C/5+) deferred — they need architectural design that should not block the GSSoC program
5. **Semgrep integration** (from competitive analysis) should be prioritized within Phase 4C — it improves SAST parity with CodeRabbit

### Research Flags Summary

| Phase | Research Needed? | Reason |
|-------|-----------------|--------|
| 4A (Foundation) | 🔬 Yes | Redis migration strategy, shared code extraction approach |
| 4B (Community) | ⚡ No | Well-documented patterns throughout codebase |
| 5A (RAG System) | 🔬 Yes | ChromaDB clustering, embedding model alternatives |
| 5B (VS Code) | ⚡ No | Standard VS Code extension patterns |
| 5C (Analytics) | ⚡ No | Standard dashboard + analytics patterns |
| 4C (Advanced) | 🔬 Yes | Plugin architecture design, auto-remediation permissions |
| Semgrep | 🔬 Yes | Integration approach and configuration |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against all package.json files, requirements.txt, .env.example, docker-compose.yml, and runtime code. Two independent analyses confirm versions. |
| Features | HIGH | Verified against README, ROADMAP.md, inline code comments, competitive landscape research, and 3 phases of completed work. All features verified in code. |
| Architecture | HIGH | Full codebase read of all 5 modules (4000+ lines of core code). Two independent architecture analyses produced consistent findings. Data flows traced end-to-end. Anti-patterns identified and documented. |
| Testing | HIGH | Verified against run-tests.js, CI config, test files (67 backend, 4 frontend, AI Engine pytest). Test framework configurations read and confirmed. |
| Pitfalls/Concerns | HIGH | Identified through code analysis of security patterns, caching layers, error handling, known TODO/comments referencing GitHub Issues (#397, #746, #1809, #1291, #395, #785, #787). Two independent concern analyses converge on the same top issues. |
| Competitive Landscape | MEDIUM | Market data from web sources (pricing changes frequently, F1 scores from third-party benchmarks). Cross-verified across 8+ sources. Self-hosted and open-source features verified in code. |

**Overall confidence:** HIGH

---

## Conflicts and Resolutions Between Agent Findings

| Conflict | Agent 1 | Agent 2 | Resolution |
|----------|---------|---------|------------|
| Backend line count | STRUCTURE.md: ~2203 lines | ARCHITECTURE.md: 2200+ lines (consistent) | ✅ No conflict — both agree |
| AI Engine test CI status | CONCERNS.md: "continue-on-error: true" | TESTING.md: "runs with continue-on-error: true" | ✅ Consistent — AI Engine tests don't block CI |
| Rate limiting on AI Engine | CONCERNS.md: "No rate limiting on /analyze" | ARCHITECTURE.md: "500 requests/min per-IP" | ⚠️ Minor conflict — there IS global per-IP rate limiting (500/min) but no per-client limit. Resolved in SUMMARY.md. |
| Extension test framework | TESTING.md: Mocha + Chai | CONVENTIONS.md: Mocha | ✅ Consistent |
| Number of test files | CONCERNS.md: 67 backend test files | STRUCTURE.md: 67 test files | ✅ Consistent |
| Backend route count | ARCHITECTURE.md: 15+ routes | STRUCTURE.md: 9 listed routes | ⚠️ Minor — ARCHITECTURE.md lists more routes including health, session, CSRF, RAG proxy. Resolved by using the comprehensive list. |

---

## Gaps to Address During Planning

1. **Distributed CSRF strategy**: Use existing Redis client (already configured for rate limiting) or implement different store. Shared Redis connection for rate-limiting + CSRF + cache is the obvious path.

2. **GitHub Action sync enforcement**: Three options: (a) run sync script in CI pre-build, (b) extract shared code to npm package, (c) have Action fetch shared config at runtime from backend. Option (b) is the most maintainable long-term.

3. **Session TTL verification**: The `$max` update logic and Session model's TTL index need careful review. Issue #672 references this.

4. **Add Python linting**: No flake8/ruff/black config exists for AI Engine. Needs decision and CI integration.

5. **Frontend test infrastructure**: Expand from 4 test files to cover Dashboard and components. `@testing-library/react` already in deps.

6. **API documentation completeness**: `API.md` covers only a subset of endpoints. Consider auto-generating from OpenAPI spec.

7. **`repoReader.js` fate**: Decide to integrate or archive during clone pipeline refactoring.

8. **AI Engine CI enforcement**: Change `continue-on-error: true` to `false` once stable.

---

## Sources

### Direct Code Analysis (HIGH confidence — primary source)
- **Backend:** `backend/index.js` (2203 lines), all 23 utility modules, all 67 test files
- **AI Engine:** `ai-engine/app.py` (1037 lines), `rag.py`, `embeddings.py`, `text_splitter.py`, `diff_helper.py`, `vectorstore.py`
- **Frontend:** `App.tsx`, `Dashboard.tsx`, all 11 components, `useStore.ts`, `api.ts`, all 4 test files
- **GitHub Action:** `index.js` (309 lines), `action.yml`, `utils/`
- **VS Code Extension:** `extension.ts`, `api.ts`, `diagnostics.ts`, `webviewProvider.ts`
- **Configuration:** `shared-safety-config.json`, `docker-compose.yml`, `.env.example` files, `render.yaml`, `vercel.json`
- **Documentation:** `docs/ARCHITECTURE.md`, `API.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `GOOD_FIRST_ISSUES.md`

### Secondary Sources (MEDIUM confidence)
- Competitive landscape: Web research across 8+ sources (lushbinary.com, sourcegraph.com, monterail.com, gitautoreview.com, cubic.dev, robinreview.dev, aitoolsrecap.com, toolchew.com)
- F1 Benchmark: Martian Benchmark data for CodeRabbit (51.2%) — single source, used as directional reference
- Pricing: Cross-verified across multiple comparison articles

---
*Research completed: 2026-07-07*
*Ready for roadmap: yes*
