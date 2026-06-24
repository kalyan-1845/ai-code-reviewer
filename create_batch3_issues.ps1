$issues = @(
    @{
        title = 'Bug: Multiple Mermaid Render Invocations Crash the App'
        body = '### Description
The `MermaidViewer` component in `Dashboard.tsx` calls `mermaid.render()` without checking if a previous render is still in progress.

### Impact
If the user quickly swaps between files or tabs, multiple render calls will be fired simultaneously, causing Mermaid to throw a `parse error` or completely crash the frontend UI.

### Proposed Solution
Implement a rendering queue or wait for the previous `Promise` to resolve before calling `mermaid.render` again. Add a ref to track the rendering state.'
        label = 'type:bug'
    },
    @{
        title = 'Security: Stored XSS Vulnerability in MermaidViewer dangerouslySetInnerHTML'
        body = '### Description
The AI-generated Mermaid SVG string is injected directly into the DOM using `dangerouslySetInnerHTML={{ __html: svg }}` in `Dashboard.tsx`.

### Impact
If an attacker manipulates the AI to output an SVG containing a malicious `<script>` tag or `<foreignObject>` payload, it will execute Arbitrary JavaScript in the user''s browser (Stored XSS).

### Proposed Solution
Use a library like DOMPurify to strictly sanitize the SVG string before injecting it into the React DOM.'
        label = 'security'
    },
    @{
        title = 'Bug: Unbounded auditHistory Storage in localStorage Leads to QuotaExceededError'
        body = '### Description
The frontend pushes the entire `BackendResponse` (which contains the full repository file contents and analysis) into `reposage_audit_history` in `localStorage`.

### Impact
Since `localStorage` is strictly limited to 5MB, storing full backend responses will immediately hit the `QuotaExceededError`, breaking the history feature and causing silent application failures.

### Proposed Solution
Store only metadata (e.g., `id`, `repoName`, `totalFindings`, `overallGrade`) in `localStorage`. Fetch the detailed analysis dynamically from the backend when a user clicks on a history entry.'
        label = 'type:bug'
    },
    @{
        title = 'Performance: setTimeout Memory Leak in QuickFixButton and CopyButton'
        body = '### Description
`CopyButton` and `QuickFixButton` components use `setTimeout(() => setCopied(false), 2000)` without clearing the timeout if the component unmounts.

### Impact
If the user clicks copy/fix and immediately navigates away or closes the modal, the state update will fire on an unmounted component, causing React memory leak warnings and degraded performance.

### Proposed Solution
Save the timeout ID in a `useRef` and call `clearTimeout(timeoutId.current)` inside a `useEffect` cleanup function.'
        label = 'frontend'
    },
    @{
        title = 'Bug: Unhandled State when Backend Model Validation Fails'
        body = '### Description
In `Dashboard.tsx`, if the API call `handleAnalyze` throws an error due to backend validation (e.g., rejected system prompt), `apiError` is set and `selectedFile` is cleared to `null`, but `activeDashboardView` is not reset.

### Impact
The UI enters a broken state where the loading spinner disappears, but the dashboard still tries to render analysis views that depend on valid data, resulting in a blank or disjointed screen.

### Proposed Solution
Ensure that when an error is caught in `handleAnalyze`, the UI safely resets to the initial "Setup Console" or provides a clear error recovery path.'
        label = 'type:bug'
    },
    @{
        title = 'Enhancement: Missing Form Submission Handling in SettingsModal'
        body = '### Description
The `SettingsModal` uses standard `div` and `button` elements instead of a proper HTML `<form>` element for user inputs.

### Impact
Users cannot press the `Enter` key to automatically submit and save their AI settings, which violates standard UX accessibility practices and form behavior expectations.

### Proposed Solution
Wrap the inputs inside a `<form onSubmit={handleSave}>` tag and change the "Save" button to `type="submit"`.'
        label = 'frontend'
    },
    @{
        title = 'Enhancement: Hardcoded Dummy Data in MetricsChart Component'
        body = '### Description
The `MetricsChart` component currently renders hardcoded `dummyData` (e.g., "Jan: 12 bugs") instead of accepting dynamic props from the backend analysis result.

### Impact
The analytics dashboard always displays the same static chart, failing to provide actual historical metrics for the user''s analyzed repositories, rendering the feature useless.

### Proposed Solution
Update `MetricsChartProps` to accept a `data` array prop and populate it with the historical audit data from the `auditHistory` state in `Dashboard.tsx`.'
        label = 'frontend'
    },
    @{
        title = 'Enhancement: Duplicated Health Score Business Logic in Frontend'
        body = '### Description
The repository health score is calculated both in the backend (`backend/index.js`) and independently re-calculated in the frontend `HealthScoreGauge.tsx` using a duplicated mathematical formula.

### Impact
If the scoring weights change in the backend, the frontend will show a completely different score, causing data mismatch and user confusion.

### Proposed Solution
Remove the `computeHealthScore` function from the frontend and rely exclusively on the `healthScore` value passed by the backend API payload.'
        label = 'frontend'
    },
    @{
        title = 'Enhancement: Duplicated Total Issues Aggregation Logic'
        body = '### Description
In `TotalIssuesKpiCard.tsx`, the `counts` variable manually re-calculates the sum of all bugs, security issues, optimization, and styling findings. This is also duplicated in `HealthScoreGauge.tsx` and `calculateTotalFindings`.

### Impact
Duplicated aggregation logic leads to maintenance overhead. If a new finding category is added (e.g., "accessibility"), it must be updated in multiple separate files.

### Proposed Solution
Calculate these aggregated metrics once at the top level in `Dashboard.tsx` and pass them down as props to the KPI and Gauge components.'
        label = 'frontend'
    },
    @{
        title = 'Bug: Unhandled Undefined Props in RepositoryOverview Crashes App'
        body = '### Description
`RepositoryOverview.tsx` assumes the `files` prop is always an initialized array. It directly calls `files.reduce` and `files.length`.

### Impact
If the backend fails to return metrics or returns an empty payload, the application will crash entirely with `TypeError: Cannot read properties of undefined (reading ''reduce'')` instead of failing gracefully.

### Proposed Solution
Add a default parameter `files = []` in the component props, or implement an early return if `!files` is passed.'
        label = 'type:bug'
    },
    @{
        title = 'Bug: Flawed HTML Block Comment Logic in Complexity Analyzer'
        body = '### Description
In `backend/utils/complexityAnalyzer.js`, HTML block comments `<!-- ... -->` are only counted as a single line if they start with `<!--`. There is no tracking for multi-line HTML comments.

### Impact
Large chunks of commented-out HTML code will artificially inflate the `codeLines` metric, reducing the repository''s grade and skewing complexity statistics.

### Proposed Solution
Implement `inBlockComment` state tracking for HTML files, setting it to true on `<!--` and false when encountering `-->`.'
        label = 'backend'
    },
    @{
        title = 'Bug: Repository URLs with Query Params or Fragments are Rejected'
        body = '### Description
The `isValidRepoUrl` function strictly matches the URL path using regex. If a user pastes a URL containing query parameters (e.g., `?tab=readme-ov-file`) or hash fragments (`#readme`), the backend rejects it as an invalid repository URL.

### Impact
Users copying links directly from their browser address bar will often face validation errors and be unable to analyze their repositories.

### Proposed Solution
Use the native Node.js `URL` API to parse the URL and validate only the `hostname` and `pathname`, ignoring `search` and `hash` before testing the regex.'
        label = 'type:bug'
    },
    @{
        title = 'Enhancement: JWT Regex Produces False Positives in Secrets Scanner'
        body = '### Description
The JWT regex in `backend/utils/secretsScanner.js` is overly broad and can match generic base64 encoded strings or standard session tokens that happen to begin with `eyJ` (Base64 for `{"`).

### Impact
Developers will see their code falsely flagged for JWT secrets on non-secret encoded strings, creating noise and alert fatigue.

### Proposed Solution
Refine the JWT regex to strictly enforce standard JWT lengths and segment counts, or validate the decoding of the header segment before flagging.'
        label = 'backend'
    },
    @{
        title = 'Bug: MongoDB Reconnect Logic Loop Fails to Reset State Properly'
        body = '### Description
In `backend/config/db.js`, `ensureConnection` loops 5 times to reconnect, but it doesn''t clear `connectionPromise` from a previous failed attempt. `connectDatabase()` immediately returns the rejected promise 5 times.

### Impact
If the initial connection fails, the system will never successfully reconnect to MongoDB, resulting in permanent loss of persistent analytics data for the lifecycle of the Node.js process.

### Proposed Solution
In `ensureConnection`, explicitly set `connectionPromise = null` before calling `connectDatabase()` inside the retry loop.'
        label = 'type:bug'
    },
    @{
        title = 'Performance: Unbounded Data Growth in Analytics Collection'
        body = '### Description
The `Analytics` MongoDB model tracks repository analyses with an `analyzedAt` field but does not implement a Time-To-Live (TTL) index.

### Impact
As the application scales and users scan thousands of repositories, the MongoDB collection will grow infinitely, leading to increased storage costs and slower query performance.

### Proposed Solution
Add `expires: 2592000` (30 days) to the `analyzedAt` index definition in `backend/models/Analytics.js` to automatically purge old analytics records.'
        label = 'backend'
    },
    @{
        title = 'Performance: Missing Cleanup for Object URLs in File Downloads'
        body = '### Description
In `Dashboard.tsx`, the functions `downloadReadme`, `downloadAuditReport`, `downloadHTMLReport`, and `downloadPDFReport` create temporary Object URLs using `URL.createObjectURL(file)` but never call `URL.revokeObjectURL(url)`.

### Impact
As users download multiple reports during a long-running session, the browser memory fills up with un-garbage-collected Blob URLs, leading to potential memory leaks and frontend sluggishness.

### Proposed Solution
Add `URL.revokeObjectURL(url)` immediately after calling `document.body.removeChild(element)` in the download functions.'
        label = 'frontend'
    },
    @{
        title = 'Enhancement: Hardcoded Dark Mode Colors in Sidebar Navigation'
        body = '### Description
The `SidebarLayout` component uses hardcoded colors like `rgba(15, 23, 42, 0.6)` for its background and `#f3f4f6` for text. These values are designed strictly for dark mode.

### Impact
When the user toggles the application theme to light mode via the Dashboard header, the sidebar will remain dark, creating an inconsistent and broken visual experience.

### Proposed Solution
Replace the hardcoded colors in `SidebarLayout` with the CSS variables defined in `index.css` (e.g., `var(--panel-bg)` and `var(--text-color)`).'
        label = 'frontend'
    },
    @{
        title = 'Bug: TypeError when options.extensions is not an Array'
        body = '### Description
In `backend/utils/repoReader.js`, `normalizeExtensions` uses `input ?? DEFAULT_EXTENSIONS`. If a caller accidentally passes an object or string instead of an array, `input.map` will throw a `TypeError: input.map is not a function`.

### Impact
Application crash when processing invalid internal API requests or when consumers of the utility pass improperly formatted configuration objects.

### Proposed Solution
Ensure `input` is cast to an array (e.g. `Array.isArray(input)`) or throw an early, descriptive validation error before attempting to map over it.'
        label = 'type:bug'
    },
    @{
        title = 'Bug: Glob Matching for * in .reposageignore is Flawed'
        body = '### Description
In `backend/utils/ignoreHelper.js`, when compiling ignore rules containing `*`, the regex replacement `pattern.replace(/\*/g, ''[^/]*'')` fails to support standard `**` globstars (which match across directory boundaries).

### Impact
Users trying to ignore nested files using standard syntax like `**/*.test.js` or `logs/**/*.log` will find that the files are still scanned, causing noisy and slow analysis results.

### Proposed Solution
Integrate an established glob-matching library like `micromatch` or `minimatch` instead of using a custom RegExp transpiler.'
        label = 'backend'
    },
    @{
        title = 'Performance: Inefficient Retrieval of All Embeddings during Cleanup'
        body = '### Description
In `ai-engine/rag.py`, `cleanup_stale_chunks` calls `collection.get(include=["metadatas"])`, which retrieves the metadata for *every single chunk* in the database into memory.

### Impact
If the database grows to thousands or millions of chunks, this call will cause an Out of Memory (OOM) error or block the process entirely, failing to remove stale chunks and leading to stale responses during chat.

### Proposed Solution
Query distinct metadata values directly using ChromaDB''s native collection properties or paginate the `.get()` method instead of fetching everything into RAM at once.'
        label = 'ai-engine'
    }
)

foreach ($issue in $issues) {
    gh issue create --title $issue.title --body $issue.body --label $issue.label
    Start-Sleep -Seconds 2
}
