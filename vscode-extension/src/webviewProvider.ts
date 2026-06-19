import * as vscode from "vscode";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        const code = escapeHtml(codeBuffer.join("\n"));
        html += `<pre><code>${code}</code></pre>`;
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
    } else if (line.startsWith("## ")) {
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
    } else if (line.startsWith("### ")) {
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
    } else if (line.trim().startsWith("- ")) {
      html += `<li>${escapeHtml(line.trim().slice(2))}</li>`;
    } else if (line.trim() === "") {
      html += `<div class="spacer"></div>`;
    } else {
      const formatted = escapeHtml(line).replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
      );
      html += `<p>${formatted}</p>`;
    }
  }

  if (codeBuffer.length > 0) {
    const code = escapeHtml(codeBuffer.join("\n"));
    html += `<pre><code>${code}</code></pre>`;
  }

  return html;
}

function getWebviewContent(markdown: string, isLoading: boolean, error: string | null): string {
  const bodyContent = error
    ? `<div class="error-message">${escapeHtml(error)}</div>`
    : isLoading
    ? `<div class="loading"><div class="spinner"></div><span>Reviewing your code...</span></div>`
    : markdown
    ? renderMarkdown(markdown)
    : `<div class="empty-state"><span class="empty-icon">🔍</span><p>Open a file and run <strong>RepoSage: Review Current File</strong> to see results here.</p></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {
  --bg: #1e1e1e;
  --card: #2d2d2d;
  --text: #d4d4d4;
  --heading: #e0e0e0;
  --accent: #569cd6;
  --code-bg: #1e1e1e;
  --code-text: #ce9178;
  --border: #3c3c3c;
  --error-bg: #3a1d1d;
  --error-text: #f48771;
  --error-border: #6b2a2a;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}
h1 { font-size: 16px; font-weight: 700; color: var(--heading); margin: 16px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
h2 { font-size: 14px; font-weight: 600; color: var(--heading); margin: 12px 0 6px 0; }
h3 { font-size: 13px; font-weight: 600; color: var(--heading); margin: 10px 0 4px 0; }
p { margin: 0 0 6px 0; }
code {
  background: var(--code-bg);
  color: var(--code-text);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
pre code {
  background: none;
  padding: 0;
  color: var(--code-text);
  line-height: 1.5;
}
li { margin-left: 16px; margin-bottom: 4px; }
.spacer { height: 6px; }
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
  color: var(--text);
}
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-message {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: var(--error-text);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  margin: 8px 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: #808080;
}
.empty-icon { font-size: 32px; margin-bottom: 12px; }
.empty-state p { font-size: 12px; line-height: 1.5; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

export class RepoSageWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "reposage.sidebarView";

  private _view?: vscode.WebviewView;
  private _markdown: string = "";
  private _isLoading: boolean = false;
  private _error: string | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = getWebviewContent(
      this._markdown,
      this._isLoading,
      this._error
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        webviewView.webview.html = getWebviewContent(
          this._markdown,
          this._isLoading,
          this._error
        );
      }
    });
  }

  public setContent(markdown: string) {
    this._markdown = markdown;
    this._error = null;
    if (this._view) {
      this._view.webview.html = getWebviewContent(
        this._markdown,
        this._isLoading,
        null
      );
    }
  }

  public setLoading(loading: boolean) {
    this._isLoading = loading;
    if (loading) {
      this._markdown = "";
      this._error = null;
    }
    if (this._view) {
      this._view.webview.html = getWebviewContent(
        this._markdown,
        this._isLoading,
        this._error
      );
    }
  }

  public setError(error: string) {
    this._error = error;
    this._markdown = "";
    this._isLoading = false;
    if (this._view) {
      this._view.webview.html = getWebviewContent("", false, error);
    }
  }
}
