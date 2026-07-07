# Testing Patterns

**Analysis Date:** Tue Jul 07 2026

## Test Framework

**Backend Runner:**
- Framework: c8 (coverage) wrapping Node.js test runner
- Config: `backend/package.json` script: `c8 --reporter=lcov --reporter=text node tests/run-tests.js`
- Run command: `cd backend && npm test`
- Coverage output: `lcov.info`

**Frontend Runner:**
- Framework: Vitest 2.1
- Config: `frontend/vitest.config.js`, `frontend/vitest-setup.js`
- Run command: `cd frontend && npm test` (vitest run)
- Assertion: Built-in (Vitest expect)
- DOM: jsdom environment

**AI Engine Runner:**
- Framework: pytest 8.3
- Config: `ai-engine/pytest.ini` (sets `pythonpath = .`)
- Run command: `cd ai-engine && python -m pytest`
- Coverage: pytest-cov

**VS Code Extension Runner:**
- Framework: Mocha 10.3 + Chai 4.4
- Config: `vscode-extension/.mocharc.yml`
- Run command: `npm run test:unit`

## Test File Organization

**Location:**
- Backend: `backend/tests/` — all tests in a flat directory (67 test files)
- Frontend: Co-located with source (`useStore.test.js` next to `useStore.ts`, `exportUtils.test.js` next to `exportUtils.ts`, `sanitize.test.js` next to `sanitize.js`)
- AI Engine: `ai-engine/tests/` — separate test directory
- VS Code Extension: `vscode-extension/src/test/` — separate test directory

**Naming:**
- Backend: `*.test.js` (e.g., `analysisCache.test.js`, `secretsScanner.test.js`)
- Frontend: `*.test.js` / `*.test.tsx`
- AI Engine: Standard pytest discovery (test_ prefix or _test suffix)
- VS Code Extension: `*.test.ts`

## Test Structure

**Backend Pattern:**
```javascript
// Example from tests/secretsScanner.test.js (inferred pattern)
import { scanSecrets } from '../utils/secretsScanner.js';
// Tests follow Arrange-Act-Assert pattern
// Mock test: input known content, assert findings match expected
```

**Frontend Pattern:**
```typescript
// Example from tests/useStore.test.js
import { renderHook, act } from '@testing-library/react';
// Tests use Vitest describe/it blocks with standard assertions
```

**AI Engine Pattern:**
```python
# Example suggested by conftest.py structure
# Pytest fixtures in conftest.py, test_ prefixed test files
```

## Mocking

**Framework:**
- Backend: Manual mocking via function replacement and dependency injection (no Jest/Vitest mocking — tests import actual modules)
- AI Engine: Pytest fixtures in `conftest.py`; environment variable manipulation for API keys
- Frontend: Vitest's built-in mocking (vi.mock, vi.fn)

**What to Mock:**
- External APIs (Groq, GitHub API, ChromaDB)
- File system operations (cloning, reading files)
- Environment variables

**What NOT to Mock:**
- Core business logic (secrets scanner regex, complexity analyzer, diff parser)
- Data transformation functions
- Validation utilities

## Coverage

**Requirements:** Not explicitly enforced, but tracked via Codecov in CI.

**Coverage tools:**
- Backend: c8 with lcov and text reporters
- AI Engine: pytest-cov with XML report
- CI: Codecov uploads both reports

**View Coverage:**
```bash
cd backend && npm test     # c8 output
cd ai-engine && python -m pytest --cov=./ --cov-report=xml tests/
```

## Test Types

**Unit Tests (Predominant):**
- Backend: 67 test files covering all utility modules
- Common subjects: secrets scanner (6+ test files), complexity analyzer (4 test files), URL validator, diff parser, auth middleware, environment verifier, etc.
- AI Engine: Import verification tests in CI

**Integration Tests:**
- Backend: `test_integration_batch.test.js` — tests the batch analysis flow
- Backend CI: Runs with MongoDB service container for `dbConfig.test.js`, `sessionModel.test.js`
- AI Engine CI: Import checks (`import chromadb`, `from app import app`)

**E2E Tests:**
- Not present — testing is unit/integration only

**AI Engine Tests:**
- CI currently uses `continue-on-error: true` (test failures don't fail the pipeline)
- Runs: pytest collection check + pytest with coverage

## Common Patterns

**Async Testing:**
```javascript
// Backend utility tests use async/await
const result = await someAsyncFunction();
assert.strictEqual(result, expected);
```

**Error Testing:**
```javascript
// Testing validation functions that throw
assert.throws(() => validateInput(badInput), /error message/);
```

**Environment Configuration:**
```javascript
// BeforeEach setup for tests that need env vars
process.env.SESSION_SECRET = 'test-secret';
process.env.REPOSAGE_API_KEY = 'test-api-key';
```

**Edge Case Coverage:**
- Dedicated test files for edge cases: `complexityAnalyzerEdgeCases.test.js`, `secretsScannerEdgeCases.test.js`, `ignoreHelperEdgeCases.test.js`
- Boundary tests: `analyzeBatchSize.test.js`, `complexityAnalyzerBoundary.test.js`
- Multi-language tests: `complexityAnalyzerMultiLanguage.test.js`

---

*Testing analysis: Tue Jul 07 2026*
