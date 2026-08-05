import {
  BackendResponse,
  formatReviewToMarkdown,
  ReviewResponse,
} from "./utils";

export interface ReviewCommandDeps {
  reviewFileContent: (
    fileName: string,
    content: string,
    apiKey: string
  ) => Promise<ReviewResponse>;
  provider: {
    setLoading: (loading: boolean) => void;
    setError: (message: string) => void;
    setContent: (markdown: string) => void;
  };
  diagnostics?: {
    updateFromResponse: (data: BackendResponse, fileName: string) => void;
  };
  showInformationMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
}

/**
 * Body of the `reposage.reviewCurrentFile` command. Extracted so the loading
 * state and error surfacing can be tested without the VS Code runtime.
 * `reviewFileContent` may throw (e.g. oversized files rejected by
 * `buildRequestBody`); the loading state must always be reset.
 */
export async function runReviewCommand(
  deps: ReviewCommandDeps,
  fileName: string,
  fileContent: string,
  apiKey: string
): Promise<void> {
  deps.provider.setLoading(true);
  deps.showInformationMessage(`RepoSage: Reviewing ${fileName}...`);

  try {
    const result = await deps.reviewFileContent(fileName, fileContent, apiKey);

    if (result.success) {
      console.log("RepoSage review result:", result.response);
      const markdown = result.data
        ? formatReviewToMarkdown(result.data)
        : result.response || "";
      deps.provider.setContent(markdown);
      if (result.data && deps.diagnostics) {
        deps.diagnostics.updateFromResponse(result.data, fileName);
      }
      deps.showInformationMessage(
        "RepoSage review complete! Check the sidebar for details."
      );
    } else {
      deps.provider.setError(result.error || "Unknown error");
      deps.showErrorMessage(`RepoSage review failed: ${result.error}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("RepoSage review error:", err);
    deps.provider.setError(message);
    deps.showErrorMessage(`RepoSage review failed: ${message}`);
  } finally {
    deps.provider.setLoading(false);
  }
}
