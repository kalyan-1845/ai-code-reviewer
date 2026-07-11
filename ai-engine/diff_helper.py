import subprocess
import re
from typing import List, Set
import requests

_GIT_REF_RE = re.compile(r"^[\w./\-]+$")

def sanitize_git_ref(ref: str) -> str:
    """Validate and sanitize a git reference to prevent command injection."""
    if not isinstance(ref, str) or not ref:
        raise ValueError("Ref must be a non-empty string")
    if len(ref) > 256:
        raise ValueError("Ref exceeds maximum length of 256 characters")
    if ref.startswith("-"):
        raise ValueError("Ref must not start with a hyphen")
    if not _GIT_REF_RE.match(ref):
        raise ValueError("Ref contains invalid characters")
    return ref


def get_changed_files_from_git(base: str, head: str) -> Set[str]:
    """
    Get list of changed files using git diff.

    Args:
        base: Base branch or commit (e.g., "main", "origin/main")
        head: Head branch or commit (e.g., "feat/fix", "HEAD")

    Returns:
        Set of changed file paths
    """
    try:
        base = sanitize_git_ref(base)
        head = sanitize_git_ref(head)
        result = subprocess.run(
            ["git", "diff", "--name-only", f"{base}...{head}", "--"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10
        )
        changed_files = {f.strip() for f in result.stdout.splitlines() if f.strip()}
        return changed_files
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Error getting changed files from git: {e}")
        return set()
    except subprocess.TimeoutExpired:
        print("⚠️  git diff timed out after 10s")
        return set()
    except FileNotFoundError:
        print("⚠️  Git not found in PATH")
        return set()
    except Exception as e:
        print(f"⚠️  Unexpected error in get_changed_files_from_git: {e}")
        return set()


def get_changed_files_from_github_pr(
    owner: str, repo: str, pull_number: int, github_token: str
) -> Set[str]:
    """
    Get list of changed files using GitHub PR API.

    Args:
        owner: Repository owner
        repo: Repository name
        pull_number: PR number
        github_token: GitHub API token (with 'repo' scope)

    Returns:
        Set of changed file paths
    """
    try:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/files"
        headers = {
            "Authorization": f"Bearer {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }

        all_files = set()
        page = 1

        while True:
            params = {"per_page": 100, "page": page}
            response = requests.get(url, headers=headers, params=params, timeout=30)
            response.raise_for_status()

            files = response.json()
            if not files:
                break

            for file_obj in files:
                if "filename" in file_obj:
                    all_files.add(file_obj["filename"])

            page += 1

        return all_files
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error getting changed files from GitHub API: {e}")
        return set()
    except Exception as e:
        print(f"⚠️  Unexpected error in get_changed_files_from_github_pr: {e}")
        return set()


def filter_files_by_changes(
    files: List, changed_files: Set[str]
) -> tuple[List, int]:
    """
    Filter files to only include those in the changed set.

    Args:
        files: List of FileItem objects with 'name' attribute
        changed_files: Set of changed file paths

    Returns:
        Tuple of (filtered_files, num_skipped)
    """
    filtered = [f for f in files if f.name in changed_files]
    skipped = len(files) - len(filtered)
    return filtered, skipped


def format_diff_header(
    num_reviewed: int, num_skipped: int, base: str = "", head: str = ""
) -> str:
    """
    Format diff mode header for report.

    Args:
        num_reviewed: Number of files reviewed
        num_skipped: Number of files skipped
        base: Base branch/commit
        head: Head branch/commit

    Returns:
        Formatted header string
    """
    parts = [f"Diff mode active: reviewing {num_reviewed} changed files"]
    if base or head:
        parts.append(f"(base: {base}, head: {head})")
    parts.append(f"\nSkipped: {num_skipped} unchanged files")
    return " ".join(parts)
