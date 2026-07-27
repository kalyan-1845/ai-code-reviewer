import base64
import os
import requests


def fetch_file_content(repo: str, file_path: str, commit_sha: str = "main") -> str:
    """
    Fetches raw file content from a GitHub repository via the GitHub REST API.

    :param repo: GitHub repository in 'owner/repo' format.
    :param file_path: Path to the file in the repository.
    :param commit_sha: Commit SHA or branch name (defaults to 'main').
    :return: Decoded string content of the file, or empty string on failure.
    """
    if not repo or not file_path:
        return ""

    # Sanitize file path (strip leading slashes)
    clean_file_path = file_path.lstrip("/")
    url = f"https://api.github.com/repos/{repo}/contents/{clean_file_path}?ref={commit_sha}"

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AI-Code-Reviewer"
    }

    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return ""

        data = response.json()
        if not isinstance(data, dict):
            return ""

        content_b64 = data.get("content", "")
        encoding = data.get("encoding", "")

        if encoding == "base64" and content_b64:
            decoded_bytes = base64.b64decode(content_b64)
            return decoded_bytes.decode("utf-8", errors="replace")
        elif "content" in data and isinstance(data["content"], str):
            return data["content"]

        return ""
    except Exception:
        return ""
