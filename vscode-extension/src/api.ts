import * as vscode from "vscode";
import {
  BackendResponse,
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  // Build outside the try so an oversized file throws a clear error
  // instead of being mislabeled as a network failure.
  const requestBody = JSON.stringify(buildRequestBody(fileName, content));

  try {
    const response = await fetch(`${apiUrl}/api/analyze-file`, {
      method: "POST",
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: parseApiError(response.status, errorText),
      };
    }

    let data: BackendResponse;
    try {
      data = (await response.json()) as BackendResponse;
    } catch {
      const raw = await response.text().catch(() => "");
      return {
        success: false,
        error: `Backend returned a non-JSON response (HTTP ${response.status}): ${raw.slice(0, 200)}`,
      };
    }
    console.log("RepoSage API response:", data);
    return {
      success: true,
      response: JSON.stringify(data, null, 2),
      data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("RepoSage API fetch failed:", err);
    return {
      success: false,
      error: formatNetworkError(apiUrl, message),
    };
  } finally {
    clearTimeout(timeout);
  }
}
