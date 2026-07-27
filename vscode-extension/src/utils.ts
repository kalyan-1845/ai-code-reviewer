export interface ReviewResponse {
  success: boolean;
  response?: string;
  data?: BackendResponse;
  error?: string;
}

export interface ReviewItem {
  type: string;
  line: number;
  description: string;
  suggestion: string;
}

export interface FileReview {
  bugs?: ReviewItem[];
  security?: ReviewItem[];
  optimization?: ReviewItem[];
  styling?: ReviewItem[];
}

export interface AnalysisData {
  fileReviews: Record<string, FileReview>;
}

export interface BackendResponse {
  success: boolean;
  analysis: AnalysisData;
}

export function buildRequestHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export function buildRequestBody(fileName: string, content: string) {
  return {
    files: [{ name: fileName, content }],
    company: "General",
    language: "English",
    model: "llama-3.3-70b-versatile",
  };
}

export function parseApiError(status: number, errorText: string): string {
  return `API error (${status}): ${errorText}`;
}

export function formatNetworkError(apiUrl: string, message: string): string {
  return `Failed to reach RepoSage backend at ${apiUrl}: ${message}`;
}

export function clampLine(line: number): number {
  if (typeof line !== "number" || !Number.isFinite(line)) return 0;
  return Math.max(0, line - 1);
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
}

export function formatDiagnosticMessage(category: string, description: string, suggestion?: string): string {
  let msg = `[${category}] ${description}`;
  if (suggestion) {
    msg += `\nSuggestion: ${suggestion}`;
  }
  return msg;
}

export function formatReviewToMarkdown(data: BackendResponse): string {
  if (!data?.analysis?.fileReviews) return "No review data available.";
  const reviews = data.analysis.fileReviews;
  const files = Object.keys(reviews);
  let md = `# RepoSage Review\n\nFound issues in **${files.length} file(s)**.\n\n`;
  for (const file of files) {
    const review = reviews[file];
    const total = countIssues(review);
    if (total === 0) continue;
    md += `## ${file}\n\n`;
    for (const [category, items] of Object.entries({ security: review.security, bugs: review.bugs, optimization: review.optimization, styling: review.styling })) {
      if (!items || items.length === 0) continue;
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      for (const item of items) {
        md += `- **Line ${item.line}** - ${item.type}: ${item.description}\n`;
        if (item.suggestion) md += `  - *Suggestion:* ${item.suggestion}\n`;
        md += `\n`;
      }
    }
  }
  return md || "No issues found.";
}

export function countIssues(fileReview: FileReview): number {
  let count = 0;
  count += (fileReview.security || []).length;
  count += (fileReview.bugs || []).length;
  count += (fileReview.optimization || []).length;
  count += (fileReview.styling || []).length;
  return count;
}
