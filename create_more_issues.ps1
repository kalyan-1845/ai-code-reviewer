$issues = @(
    @{
        title = 'Security: Timing Attack Vulnerability in API Key Validation';
        body = "### Description`nIn backend/utils/authMiddleware.js, the API key is verified using a simple string equality check (providedKey !== validKey).`n`n### Impact`nThis is vulnerable to timing attacks. An attacker can determine the correct API key character by character by measuring the response time, potentially bypassing authentication.`n`n### Proposed Solution`nUse Node.js crypto.timingSafeEqual for comparing the provided API key with the expected API key to prevent timing side-channel attacks.";
        label = "security"
    },
    @{
        title = 'Bug: Flawed Arrow Function Detection in complexityAnalyzer.js';
        body = "### Description`nIn backend/utils/complexityAnalyzer.js, function detection for JS/TS uses trimmed.includes('=>') to count functions.`n`n### Impact`nAny code line containing >= (greater than or equal to, combined with a >) or simply the string '=>' will be falsely counted as a function, inflating the complexityScore and incorrectly giving the file a bad grade.`n`n### Proposed Solution`nUse a more robust Regex to detect arrow functions like /(.*?)\s*=>/ or an AST parser instead of a raw .includes.";
        label = "type:bug"
    },
    @{
        title = 'Bug: Python Docstrings Ignored in Complexity Analyzer';
        body = "### Description`ncomplexityAnalyzer.js tracks # for Python comments but completely ignores Python multi-line docstrings.`n`n### Impact`nFiles with extensive Python docstrings will have their codeLines incorrectly inflated, heavily skewing the complexity score negatively.`n`n### Proposed Solution`nAdd state tracking for inPythonDocstring matching triple-quotes similarly to how inBlockComment works for C-style languages.";
        label = "type:bug"
    },
    @{
        title = 'Performance: LRU Cache Implementation is O(N) instead of O(1)';
        body = "### Description`nIn ai-engine/embeddings.py, the LRU cache uses a list _cache_access_order and calls .pop(0) and .remove(file_path) when updating or invalidating the cache.`n`n### Impact`n.pop(0) and .remove() on a list are O(N) operations. If MAX_CACHE_SIZE is large, clearing or updating the cache will lock the thread for a significant time, creating a severe bottleneck during high-throughput RAG ingestions.`n`n### Proposed Solution`nReplace the list + dict with collections.OrderedDict which natively supports O(1) LRU operations like move_to_end and popitem(last=False).";
        label = "enhancement"
    },
    @{
        title = 'Bug: Mock Review Engine Always Reports Hardcoded Line Numbers';
        body = "### Description`nThe mockAIReview utility always assigns static line numbers (e.g. 12 for bugs, 5 for security, 25 for optimization).`n`n### Impact`nIf a file contains fewer lines than the hardcoded numbers, the frontend might crash or highlight non-existent lines when displaying the mock review results.`n`n### Proposed Solution`nCheck the file content length and assign a line number randomly between 1 and the actual file.totalLines.";
        label = "type:bug"
    },
    @{
        title = 'Performance: Blocking Synchronous I/O in deleteFolderRecursive';
        body = "### Description`nIn backend/utils/fileHelper.js, the deleteFolderRecursive and getFolderSize functions use completely synchronous fs methods (e.g., fs.readdirSync, fs.statSync, fs.unlinkSync).`n`n### Impact`nWhen a user triggers an analysis of a large repository, the Node.js event loop will be entirely blocked while calculating the folder size and deleting it. The server becomes unresponsive to all other incoming API requests or Webhooks.`n`n### Proposed Solution`nRewrite these helper functions to use the asynchronous fs.promises API (e.g., fs.promises.rm(dir, { recursive: true, force: true })).";
        label = "enhancement"
    },
    @{
        title = 'Bug: readFilesRecursively MAX_FILES Limit Bypass';
        body = "### Description`nIn backend/utils/ignoreHelper.js, the readFilesRecursively function checks if (fileList.length >= MAX_FILES) return fileList; at the beginning of the function. However, inside the for loop, it pushes new files without checking this limit.`n`n### Impact`nIf a directory contains thousands of files, all of them will be read into memory and pushed to fileList, bypassing the 500 file limit and potentially causing an Out Of Memory (OOM) crash.`n`n### Proposed Solution`nAdd if (fileList.length >= MAX_FILES) return fileList; inside the for loop immediately before or after fileList.push().";
        label = "type:bug"
    },
    @{
        title = 'Performance: Dangerous Unicode Normalization Regex in validatePrompt';
        body = "### Description`nvalidatePrompt generates a regex dynamically in a loop: const regex = new RegExp(pattern, 'i'); for every phrase in the dangerous directive list.`n`n### Impact`nIf the dangerous phrase list grows, dynamically recompiling RegExes on every request creates an unnecessary CPU overhead and slows down request processing.`n`n### Proposed Solution`nPre-compile the array of dangerous regular expressions outside the validatePrompt function so they are created only once at module load time.";
        label = "enhancement"
    },
    @{
        title = 'Bug: Insecure Math.round Health Score Calculation Logic';
        body = "### Description`nThe health score calculation subtracts 3 points for security issues, but 5 points for general bugs.`n`n### Impact`nRepositories with critical security vulnerabilities will receive higher (better) health scores than repositories with minor bugs, misrepresenting the security posture of the project.`n`n### Proposed Solution`nAdjust the weights so totalSecurityIssues has the highest penalty (e.g., 10 or 15), and standard bugs have a lower penalty.";
        label = "type:bug"
    },
    @{
        title = 'Bug: AI Engine Fallback Fails to Set _mock flag correctly';
        body = "### Description`nWhen the AI engine fails (timeout or offline), the backend catches the error and sets reviewResult = mockAIReview(files, model); but forgets to set reviewResult._mock = true;.`n`n### Impact`nThe frontend has no way of reliably knowing if the review was generated by the real AI engine or the local mock fallback, potentially misleading users into trusting mock data.`n`n### Proposed Solution`nExplicitly set reviewResult._mock = true; inside the catch block that triggers mockAIReview().";
        label = "type:bug"
    },
    @{
        title = 'Enhancement: Hardcoded Inline Styles in QuickFixButton';
        body = "### Description`nQuickFixButton in App.tsx uses extensive inline styles instead of CSS modules or Tailwind classes.`n`n### Impact`nThis makes the component difficult to theme, maintain, and overriding styles for dark/light mode is impossible, violating frontend best practices.`n`n### Proposed Solution`nMove all inline styles into an external CSS file or replace them with Tailwind CSS utility classes.";
        label = "frontend"
    },
    @{
        title = 'Enhancement: Missing Input Validation on repoUrl Frontend Field';
        body = "### Description`nThe frontend repository input field lacks basic pattern validation before submitting to the backend.`n`n### Impact`nUsers can submit arbitrary strings, causing unnecessary backend API errors, wasted network requests, and a poor user experience.`n`n### Proposed Solution`nAdd pattern=https://github\.com/.* and required attributes to the HTML input element.";
        label = "frontend"
    },
    @{
        title = 'Performance: Lack of Debounce on Filter/Search Inputs';
        body = "### Description`nIf there are search inputs in the frontend (e.g. searching review findings), they trigger state updates and full re-renders on every keystroke.`n`n### Impact`nSearching large repositories will cause the UI to stutter significantly due to massive React reconciliation trees.`n`n### Proposed Solution`nWrap the onChange handler with a lodash debounce or use a custom useDebounce hook to limit state updates.";
        label = "frontend"
    },
    @{
        title = 'Bug: Uncaught Async Errors in Frontend Fetch Calls';
        body = "### Description`nIn the frontend, API calls might not properly catch network disconnection errors (e.g., when the backend is completely unreachable or CORS fails).`n`n### Impact`nThe app silently fails, leaving the loading spinner running infinitely and providing no feedback to the user.`n`n### Proposed Solution`nEnsure all fetch blocks have a .catch() or try/catch that updates an errorState variable to display a user-friendly error message.";
        label = "type:bug"
    },
    @{
        title = 'Enhancement: Lack of Contrast in Code Snippet Highlights';
        body = "### Description`nThe code-font CSS uses #c084fc text on rgba(0,0,0,0.2) background, which fails WCAG AA contrast ratio requirements.`n`n### Impact`nVisually impaired users will struggle to read the generated code snippets, making the platform inaccessible.`n`n### Proposed Solution`nDarken the background color to #1e1e1e or lighten the text color to improve contrast.";
        label = "frontend"
    },
    @{
        title = 'Enhancement: No Request Timeout in Axios/Fetch Calls in Frontend';
        body = "### Description`nAPI requests from the frontend do not specify a timeout parameter.`n`n### Impact`nIf the backend hangs during a complex RAG query or Git clone, the frontend will wait indefinitely, giving the illusion of a frozen app.`n`n### Proposed Solution`nImplement AbortController and a setTimeout to abort the fetch if it takes longer than 60 seconds, displaying a timeout error.";
        label = "frontend"
    },
    @{
        title = 'Bug: Duplicate Key Warnings in React Lists';
        body = "### Description`nIf the AI engine returns multiple findings on the same line with the same type, iterating over them in React using index as a key causes duplicate key warnings.`n`n### Impact`nReact performance degrades, and state inside list items might leak across components during re-renders.`n`n### Proposed Solution`nGenerate a unique ID for each finding when mapping over the arrays.";
        label = "type:bug"
    },
    @{
        title = 'Performance: Unoptimized React Context Usage';
        body = "### Description`nIf global state is stored in a single monolithic React Context, every component that consumes that context re-renders when *any* part of the state changes.`n`n### Impact`nSelecting a file in the sidebar causes the chat component, the header, and the dashboard to unnecessarily re-render.`n`n### Proposed Solution`nSplit the global context into smaller, granular contexts (e.g., ReviewContext, ChatContext) or use a library like Zustand.";
        label = "frontend"
    },
    @{
        title = 'Enhancement: Missing aria-expanded Attribute on Dropdowns';
        body = "### Description`nThe QuickFixButton implements a custom dropdown menu but lacks ARIA attributes.`n`n### Impact`nScreen reader users will not know when the Quick Fix menu is opened or closed, failing accessibility standards.`n`n### Proposed Solution`nAdd aria-expanded={open} and aria-haspopup=menu to the toggle button in App.tsx.";
        label = "frontend"
    },
    @{
        title = 'Enhancement: Missing Skeleton Loaders for Dashboard Data';
        body = "### Description`nWhen the Analytics dashboard mounts, it likely shows a blank screen or a simple Loading text while fetching data from the database.`n`n### Impact`nThis results in layout shift and a less premium, jittery user experience.`n`n### Proposed Solution`nImplement Skeleton loader placeholders (e.g., pulsating gray boxes) that mimic the shape of the analytics cards while data is fetching.";
        label = "frontend"
    }
)

foreach ($issue in $issues) {
    gh issue create --title $issue.title --body $issue.body --label $issue.label
    Start-Sleep -Seconds 1
}
