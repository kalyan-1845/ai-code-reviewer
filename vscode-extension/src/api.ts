import * as vscode from "vscode";

export interface ReviewResponse {
  success: boolean;
  response?: string;
  error?: string;
}

function getConfig() {
  const config = vscode.workspace.getConfiguration("reposage");
  const apiUrl = config.get<string>("apiUrl", "http://localhost:5000");
  const apiKey = config.get<string>("apiKey", "");
  return { apiUrl, apiKey };
}

export async function reviewFileContent(
  fileName: string,
  content: string
): Promise<ReviewResponse> {
  const { apiUrl, apiKey } = getConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const response = await fetch(`${apiUrl}/api/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        code: content,
        fileName: fileName,
        company: "General",
        language: "English",
        model: "llama-3.3-70b-versatile",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    return { success: true, response: JSON.stringify(data, null, 2) };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to reach RepoSage backend at ${apiUrl}: ${err.message}`,
    };
  }
}
