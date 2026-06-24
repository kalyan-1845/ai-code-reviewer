$updates = @{
    493 = @{
        body = "### Description`nThe backend endpoint `/api/issues/create` accepts a `repoUrl` and creates an issue using the server's `GITHUB_PAT`. However, it lacks validation to ensure the user is only creating issues on the repository they just analyzed.`n`n### Impact`nAny user with the frontend API key can use this endpoint to spam arbitrary GitHub repositories with issues on behalf of the bot account, leading to account suspension.`n`n### Proposed Solution`nRequire the `sessionId` and validate that the `repoUrl` matches the currently analyzed repository in the `repoContexts`, or restrict issue creation to an allowlist of repositories."
    }
    494 = @{
        body = "### Description`nThe `/api/issues/create` endpoint does not implement the `express-rate-limit` middleware, unlike `/api/analyze` and `/api/chat`.`n`n### Impact`nMalicious actors or scripts can spam this endpoint, exhausting the GitHub API rate limit for the server's PAT and causing Denial of Service.`n`n### Proposed Solution`nApply a strict rate limiter (e.g., max 3 issues per 5 minutes per IP) to the `/api/issues/create` route in `backend/index.js`."
    }
    495 = @{
        body = "### Description`nThe endpoints `/api/reports/html` and `/api/reports/pdf` generate dynamic content using string concatenation and `pdfkit`. They lack rate limiting.`n`n### Impact`nAttackers can send large JSON payloads repeatedly. `pdfkit` is CPU intensive, so this can easily cause event loop blocking and CPU starvation (DoS).`n`n### Proposed Solution`nAdd a rate limiter (e.g., 10 requests per minute) to the report generation routes."
    }
    496 = @{
        body = "### Description`nIn `backend/index.js`, the repository size is checked using `getFolderSize(clonePath)` *after* `git.clone` completes.`n`n### Impact`nA user can submit a repository containing a massive zip bomb. The clone will consume all available disk space on the server before the size check triggers, crashing the application.`n`n### Proposed Solution`nEnforce a strict `--depth 1` (already present) but also monitor incoming bytes during clone and abort the process if it exceeds `MAX_REPO_SIZE_MB`, or use `git rev-list` size queries before full cloning."
    }
    497 = @{
        body = "### Description`nThe FastAPI endpoints `/api/rag/cleanup` and `/api/rag/delete-vectors` in `ai-engine/app.py` lack any form of authentication or API key verification.`n`n### Impact`nAnyone who discovers the AI engine URL can arbitrarily delete vectors from the ChromaDB instance, destroying the RAG capabilities for other users.`n`n### Proposed Solution`nImplement API key authentication (e.g., a shared secret via headers between the Node backend and Python AI Engine) for the FastAPI server routes."
    }
    498 = @{
        body = "### Description`nThe `/api/analyze` endpoint strictly validates the `systemPrompt` to prevent homoglyphs and dangerous directives. However, the `/api/chat` endpoint passes the `systemPrompt` straight from the client without running it through `validatePrompt()`.`n`n### Impact`nAttackers can bypass the security filters entirely by injecting malicious prompts through the chat interface.`n`n### Proposed Solution`nApply the same `validatePrompt()` function to the `systemPrompt` inside the `/api/chat` route before passing it to the AI engine."
    }
    499 = @{
        body = "### Description`nIn the Python AI engine, the HTML/CSS sanitizer allows the `background` CSS property but does not actively filter `url(data:text/html...)` payloads.`n`n### Impact`nAn AI hallucination or a poisoned prompt could return CSS containing malicious data URIs, which could be rendered by the frontend, leading to Cross-Site Scripting (XSS).`n`n### Proposed Solution`nConfigure the `bleach.css_sanitizer` to explicitly reject `data:` URIs or restrict URLs to `https://`."
    }
    500 = @{
        body = "### Description`nIn `ai-engine/app.py`, when processing multiple files in `review-diff` or `analyze`, the code splits files into batches and processes them synchronously using a `for` loop.`n`n### Impact`nAnalyzing large repositories takes an unacceptably long time because the engine waits for each Groq API call to finish before starting the next one.`n`n### Proposed Solution`nRefactor the batch processing loop to use `asyncio.gather` so that multiple Groq API requests run concurrently."
    }
    501 = @{
        body = "### Description`nThe AI engine text splitter accepts file contents for ingestion. There is no hard limit on the length of a single string passed to the chunker.`n`n### Impact`nPassing a 50MB minified JS file directly to `RecursiveCharacterTextSplitter` will block the Python main thread and cause a CPU spike/memory bloat, leading to process starvation.`n`n### Proposed Solution`nImplement a hard character limit per file (e.g., skip files > 1MB) before passing them to the text splitter."
    }
    502 = @{
        body = "### Description`nIn the frontend Chat component, when the AI streams a response or generates a long reply, the view remains static.`n`n### Impact`nThe user has to manually scroll down continuously to read the incoming text, resulting in a poor user experience.`n`n### Proposed Solution`nAdd a `useRef` to the bottom of the message list and use a `useEffect` to trigger `scrollIntoView({ behavior: 'smooth' })` whenever the messages array updates."
    }
    503 = @{
        body = "### Description`nThe copy and download buttons overlaid on Markdown code blocks lack descriptive `aria-label` attributes.`n`n### Impact`nScreen readers cannot properly identify the purpose of these buttons, breaking accessibility compliance (WCAG).`n`n### Proposed Solution`nUpdate the React component rendering the code blocks to include `"aria-label='Copy code'`" and `"aria-label='Download code'`" on the respective button elements."
    }
    504 = @{
        body = "### Description`nExpanding or collapsing a file/folder in the left-hand review findings tree triggers a state update that re-renders the entire tree component.`n`n### Impact`nFor large repositories with hundreds of files, toggling a single folder causes noticeable UI lag and frozen frames.`n`n### Proposed Solution`nMemoize the tree node components using `React.memo` so that only the toggled node updates, rather than re-rendering the entire list."
    }
    505 = @{
        body = "### Description`nWhen a user clicks the Download PDF or Download HTML button, the frontend makes a blocking API request to the backend without any UI indicator.`n`n### Impact`nThe UI appears frozen or unresponsive for several seconds. Users may click the button multiple times, triggering concurrent expensive requests.`n`n### Proposed Solution`nAdd an `isExporting` state variable to show a loading spinner on the button and disable it while the fetch request is pending."
    }
    506 = @{
        body = "### Description`nIf the AI engine needs to retrieve vectors for debugging or cleanup, fetching all vectors at once from ChromaDB is an unpaginated operation.`n`n### Impact`nAs the ChromaDB database grows, an unpaginated query will eventually crash the Python process due to an Out of Memory (OOM) error.`n`n### Proposed Solution`nUpdate the ChromaDB wrapper functions to support `limit` and `offset` parameters for cursor-based pagination."
    }
    507 = @{
        body = "### Description`nIn `backend/index.js`, the `repoContexts` Map stores all cloned file contents in memory for 30 minutes.`n`n### Impact`nBecause a repository can be up to 100MB, storing multiple contexts in RAM will rapidly exhaust the Node.js heap limit, causing a complete server crash (OOM).`n`n### Proposed Solution`nInstead of storing `files` in memory, store the parsed files to a temporary JSON file on disk, or upload them to Redis, retaining only the file metadata in memory."
    }
    508 = @{
        body = "### Description`nThe `reviewQueues` Map stores pending pull request review tasks in local memory.`n`n### Impact`nIf the backend server restarts (e.g., during a deployment) or crashes, all queued GitHub webhook events are permanently lost and PRs will remain un-reviewed.`n`n### Proposed Solution`nMigrate the queue system from in-memory Maps to a persistent message broker like Redis (BullMQ) or a simple database table for pending jobs."
    }
    509 = @{
        body = "### Description`nIn `ai-engine/app.py`, the `/chat` route accepts a `systemPrompt` parameter but completely ignores it, hardcoding its own prompt instead.`n`n### Impact`nUsers cannot customize the persona or instructions of the chat assistant, rendering the frontend's prompt settings useless during chat interactions.`n`n### Proposed Solution`nUpdate the `chat_with_repository` function to read `request.systemPrompt` and incorporate it dynamically into the `messages` array."
    }
    510 = @{
        body = "### Description`nIf an error occurs during the sequential batch processing in the AI engine, the current implementation throws a 500 error if it's the first batch, but might silently drop failures on subsequent batches.`n`n### Impact`nThe user receives an incomplete review report without any indication that certain files were skipped due to API failures.`n`n### Proposed Solution`nCatch exceptions within the batch loop, append the failed files to an `errors` array, and return a `206 Partial Content` or include an `errors` metadata field in the JSON response."
    }
    511 = @{
        body = "### Description`nThe `ReactMarkdown` component in the frontend is vulnerable to crashes if it receives a malformed AST or deeply nested invalid markdown from the AI.`n`n### Impact`nA single malformed markdown string will crash the entire React application, resulting in a blank white screen.`n`n### Proposed Solution`nWrap the Markdown renderer in a React `ErrorBoundary` component that catches rendering errors and displays a safe fallback text instead of crashing the app."
    }
    512 = @{
        body = "### Description`nIf the `VITE_API_URL` environment variable is not defined during the frontend build process, the application attempts to fetch from `undefined/api/...`.`n`n### Impact`nThe application fails catastrophically with cryptic network errors rather than gracefully alerting the developer to the misconfiguration.`n`n### Proposed Solution`nAdd a fallback to relative paths (e.g., `/api`) or implement a startup check in the frontend entry point to display a clear 'Configuration Error: API URL Missing' screen."
    }
}

foreach ($id in $updates.Keys) {
    $body = $updates[$id].body
    $tmpFile = "tmp_body_$id.txt"
    Set-Content -Path $tmpFile -Value $body
    gh issue edit $id --body-file $tmpFile
    Remove-Item $tmpFile
    Start-Sleep -Seconds 1
}
