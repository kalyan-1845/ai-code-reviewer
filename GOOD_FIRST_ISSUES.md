# 🌟 Good First Issues (GSSoC '26)

Welcome to the **RepoSage** contributor hub! If you are participating in **GSSoC '26** or looking to make your first contributions, these tasks are designed specifically for you.

To claim an issue:
1. Browse the list below or check the GitHub Issues tab.
2. Comment on the issue requesting to be assigned.
3. Wait for an administrator or mentor to assign it to you.
4. Submit your PR within the specified timeline.

---

## 📋 Open Issues List

### 1. 🎨 Frontend: Implement "Copy Code" Button in Code Viewer
* **Description**: When reviewing code files in the dashboard, users want to quickly copy file content. We need a "Copy Code" button at the top of the code viewer.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`
* **Implementation Hints**:
  - Locate the code container inside `frontend/src/App.tsx`.
  - Add a clipboard copy button (using a `lucide-react` icon like `Copy` or `Check` for success state).
  - Use `navigator.clipboard.writeText(selectedFileContent)` to save to clipboard.
  - Implement a 2-second visual feedback (e.g., changing the icon or showing "Copied!").

### 2. ⚙️ Backend: Add Detection Rules for Private Keys & API Tokens
* **Description**: Expand the backend's security scanner helper to detect generic private keys and other common credentials to protect developer codebases.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `backend`
* **Implementation Hints**:
  - Open `backend/index.js` and locate the `scanSecrets` function.
  - Add regex rules for:
    1. Generic Private Keys (e.g. detecting `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`).
    2. Common credentials in `.env` / config files (e.g. `PASSWORD = "..."`, `SECRET_KEY = "..."`) using refined regex.
    3. Twilio Account SID (`AC[a-f0-9]{32}`) and Auth Token.
  - Confirm the new findings are correctly mapped to findings list format.

### 3. 🧠 AI Engine & Docs: Document API Endpoints in API.md
* **Description**: Document the HTTP API endpoints exposed by both the Node.js Express backend and the FastAPI AI engine to make developer onboarding easier.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `documentation`
* **Implementation Hints**:
  - Create a new markdown file named `API.md` in the root folder.
  - Document `POST /api/analyze` on the Express backend (inputs: `repoUrl`, `model`, `language`, outputs: JSON structure containing `bugs`, `security`, `optimization` findings, and file list).
  - Document `POST /analyze` on the Python FastAPI server.
  - Provide complete `curl` request and response JSON examples.
  - Add a link to `API.md` in the root `README.md`.

### 4. 🎨 Frontend: Persist Contributor Assignments to Local Storage
* **Description**: The GSSoC contributor assignment portal simulator on the React dashboard resets assignments when the page is refreshed. Let's persist these to `localStorage`.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`
* **Implementation Hints**:
  - Open `frontend/src/App.tsx` and find the state declaration `assignedContributors`.
  - Initialize the state by loading data from `localStorage.getItem('reposage_contributor_assignments')` if present.
  - Update `handleAssignContributor` to save assignments into `localStorage` using `localStorage.setItem`.
  - Add a "Reset Assignments" button below the simulator grid to clear `localStorage` and reset assignments to "Unassigned".

### 5. 🎨 Frontend: Implement Light/Dark Theme Toggle
* **Description**: Implement a Theme Toggle switch (Light/Dark mode) in the dashboard navbar to improve visual accessibility and customize styling using CSS variables.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`, `styling`
* **Implementation Hints**:
  - Add a toggle switch inside the header component in `frontend/src/App.tsx`.
  - Define CSS variables for key colors (backgrounds, text, borders) in `frontend/src/index.css` and use them dynamically.
  - Persist theme preference in `localStorage`.

### 6. 🎨 Frontend: Interactive File Tree Filter & Search
* **Description**: Add a search input box at the top of the File Navigator side panel to quickly filter files by name or extension in repositories with large directory structures.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`
* **Implementation Hints**:
  - Open `frontend/src/App.tsx` and find the File Tree List rendering block.
  - Add an input filter textbox with search/filter queries, and only render matching keys.

### 7. ⚙️ Backend: Add Endpoint to Export Review Reports to HTML
* **Description**: Extend the Express backend with a new endpoint to convert and download structured AI reviews as a nicely formatted HTML page.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `backend`
* **Implementation Hints**:
  - Add `POST /api/reports/html` in `backend/index.js` taking the JSON report findings.
  - Generate a styled HTML string with a table layout, and return it with correct attachment headers.

### 8. ⚙️ Backend: Static Code Complexity Metrics Analyzer
* **Description**: Add basic AST-based static metrics parsing (Total lines of code, comment lines, function declarations) for uploaded repository files.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `backend`
* **Implementation Hints**:
  - Write a helper parsing files in `backend/index.js` to compute counts and return them under a new `metrics` property per analyzed file.

### 9. ⚙️ Backend: Support `.reposageignore` Config File for Excluding Files from Analysis
* **Description**: Allow users to exclude specific files or directories (e.g., `node_modules/`, `dist/`, tests) from being scanned by the AI and metrics analyzer by reading a `.reposageignore` config file.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `backend`, `enhancement`
* **Implementation Hints**:
  - Check if a `.reposageignore` file exists in the root of the cloned repository.
  - Parse the ignore patterns (support `.gitignore`-style wildcards).
  - Filter the file list before running analysis and metrics computation.

### 10. 🎨 Frontend: Dashboard Audit History with Persistent Recents
* **Description**: Persist a history of successfully audited repositories in `localStorage` so users can see recent audits and quickly reload cached results without re-cloning.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`, `ux`
* **Implementation Hints**:
  - Store metadata of successful analysis runs in `localStorage` under `reposage_audit_history`.
  - Render a "Recent Audits" section in the sidebar listing the 5 most recent audits.
  - Clicking a recent audit loads its cached analysis result immediately.

### 11. 📊 Frontend: File Extension & Code Composition Charts
* **Description**: Create a visual dashboard component showing the distribution of file types across the repository and aggregated code vs. comment vs. empty line ratios.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`
* **Implementation Hints**:
  - Aggregate file extension stats from the analysis result object.
  - Build a horizontal stacked bar using pure CSS (no chart libraries).
  - Add a "Repository Overview" section at the top of the audit dashboard.

### 12. ⚙️ Backend: Add Export Report to PDF
* **Description**: Add a `POST /api/reports/pdf` endpoint to generate and download a formatted PDF copy of the full code audit report.
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `backend`
* **Implementation Hints**:
  - Use `pdfkit` or `pdf-creator-node` to generate the PDF.
  - Include repo name, date, grade, findings, and metrics in the document.
  - Add an "Export PDF" button in the frontend navbar.

### 13. 🎨 Frontend: Settings Modal for AI Model Parameter Controls
* **Description**: Add a settings gear button in the header that opens a modal to customize AI analysis parameters (temperature, max tokens, custom system prompt).
* **Suggested Labels**: `gssoc26`, `good-first-issue`, `frontend`, `backend`
* **Implementation Hints**:
  - Create a modal with sliders/inputs for temperature, max tokens, and a system prompt textarea.
  - Persist settings in `localStorage` under `reposage_ai_settings`.
  - Pass settings in the body of the `POST /api/analyze` request.

---

## 🚀 Major "Killer Features" (Advanced Tasks)

Looking for a bigger challenge? We have officially opened development for our next-generation major features. These tasks require more experience and will have a massive impact on the project.

### 14. 🪄 Auto-Remediation (One-Click Fixes)
* **Description**: Integrate the GitHub API's "Suggested Changes" feature so our PR bot automatically writes the code to fix the bugs it finds.
* **Suggested Labels**: `gssoc26`, `enhancement`, `ai-engine`, `major-feature`
* **Implementation Hints**: 
  - Update the Groq LLM prompt to accurately return the corrected code block.
  - Format the bot's comment to use the standard markdown ` ```suggestion ` syntax.
  - Ensure the line mapping works correctly so suggestions don't break the build.

### 15. 🧪 Automated Unit Test Generator
* **Description**: Create an AI tool that automatically generates full Jest or PyTest unit test suites for untestable code files.
* **Suggested Labels**: `gssoc26`, `enhancement`, `backend`, `ai-engine`, `major-feature`
* **Implementation Hints**:
  - Create a new `/api/generate-tests` endpoint.
  - Build a prompt template that identifies exported functions and writes edge-case test cases.
  - Add a "Generate Tests" button next to files in the frontend codebase browser.

### 16. 🔍 Semantic Code Search
* **Description**: Allow developers to search the codebase using natural language (e.g., "Where is the payment logic?") instead of standard keyword search.
* **Suggested Labels**: `gssoc26`, `enhancement`, `ai-engine`, `major-feature`
* **Implementation Hints**:
  - Convert all code files into vector embeddings upon repository import.
  - Store these embeddings in an open-source Vector Database like ChromaDB.
  - When a user searches, perform a similarity search and return the top matched files with context.

---

Let's make RepoSage an amazing open-source experience together! 🚀🔥
