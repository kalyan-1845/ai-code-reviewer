import * as vscode from "vscode";
import {
  ReviewResponse,
  buildRequestBody,
  buildRequestHeaders,
  formatNetworkError,
  parseApiError
} from "./utils";

export { ReviewItem, FileReview, AnalysisData, BackendResponse, ReviewResponse } from "./utils";

function getConfig() {
  const config = vscode.workspace.getConfiguration("reposage");
  const apiUrl = config.get<string>("apiUrl", "http://localhost:5000");
  return { apiUrl };
}

export async function reviewFileContent(
  fileName: string,
  content: string,
  apiKey: string
): Promise<ReviewResponse> {
  const { apiUrl } = getConfig();

  const headers = buildRequestHeaders(apiKey);

  try {
    const response = await fetch(`${apiUrl}/api/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildRequestBody(fileName, content)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: parseApiError(response.status, errorText),
      };
    }

    const data = await response.json();
    console.log("RepoSage API response:", data);
    return { success: true, response: JSON.stringify(data, null, 2) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("RepoSage API fetch failed:", err);
    return {
      success: false,
      error: formatNetworkError(apiUrl, message),
    };
  }
}
