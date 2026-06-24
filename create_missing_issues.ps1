$issues = @(
    @{ title='Bug: Memory Leak in Session Contexts (repoContexts)'; body='The backend stores repoContexts (containing all cloned files) in memory for 30 minutes. This unbounded in-memory storage can lead to an Out Of Memory (OOM) crash if a user repeatedly analyzes large repositories.'; label='type:bug' },
    @{ title='Bug: Webhook Processing Queue Memory Loss on Restart'; body='The reviewQueues Map stores pending pull request review tasks in memory. If the Node.js server crashes or restarts, all queued PR reviews are permanently lost.'; label='type:bug' },
    @{ title='Bug: ChatRequest Model Ignores systemPrompt'; body='In ai-engine/app.py, the user-provided systemPrompt in the /chat route is completely ignored and overwritten with a hardcoded RepoSage Chat system prompt.'; label='type:bug' },
    @{ title='Bug: Silent Failure on Partial Batch Processing'; body='If the first batch in the AI engine fails, it raises an HTTP exception, but if subsequent batches fail, they are silently skipped. The API should return a partial success indicator to the frontend so the user knows some files were not analyzed.'; label='type:bug' },
    @{ title='Bug: Missing Error Boundary for Markdown Renderer'; body='If ReactMarkdown fails to parse a malformed AI response in the frontend, it crashes the entire chat/review UI. An ErrorBoundary should be wrapped around the markdown components.'; label='type:bug' },
    @{ title='Bug: Hardcoded API URLs in Production Builds Break Gracefully'; body='If VITE_API_URL is omitted, the frontend breaks completely instead of gracefully showing a misconfiguration error state or falling back to a relative path.'; label='type:bug' }
)

foreach ($issue in $issues) {
    gh issue create --title $issue.title --body $issue.body --label $issue.label
    Start-Sleep -Seconds 1
}
