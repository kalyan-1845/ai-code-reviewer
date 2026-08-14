import os
import re
from typing import Dict, Any, List

from services.secret_scrubber import scrub_secrets
from src.graph.state import AgentState


def _is_pure_pin_dependency_change(raw_diff: str) -> bool:
    """True if the diff only changes lockfile hashes/pins (no URL, version, or package-name changes)."""
    change_lines = [
        line[1:].strip().strip('",')
        for line in raw_diff.splitlines()
        if (line.startswith("+") or line.startswith("-")) and not (line.startswith("+++") or line.startswith("---"))
    ]
    if not change_lines:
        return True

    hash_markers = ("integrity", "sha256", "sha512", "sha384", "sha1", "md5", "hashes", "hash")
    hex_blob = re.compile(r"[a-fA-F0-9]{32,}")
    for line in change_lines:
        lowered = line.lower()
        if any(marker in lowered for marker in hash_markers):
            continue
        if hex_blob.search(line):
            continue
        return False
    return True


def triage_router(state: AgentState) -> Dict[str, Any]:
    """
    Analyzes modified file paths, diff content, and commit messages to categorize the PR
    and determine whether it can bypass heavy code review.
    """
    modified_files = state.get("modified_files") or state.get("file_paths") or []
    raw_diff = state.get("raw_diff", "")

    if not modified_files and raw_diff:
        extracted = []
        for line in raw_diff.splitlines():
            if line.startswith("diff --git"):
                parts = line.split(" ")
                if len(parts) >= 4 and parts[3].startswith("b/"):
                    extracted.append(parts[3][2:])
            elif line.startswith("+++ b/"):
                extracted.append(line[6:])
        modified_files = list(dict.fromkeys(extracted))

    commit_messages = state.get("commit_messages", [])
    commit_str = " ".join(commit_messages).lower()

    if not modified_files:
        return {
            "pr_category": "TRIVIAL",
            "is_trivial": True
        }

    # 1. DOCS: files ending with .md, .txt, or inside docs/
    docs_extensions = ('.md', '.txt', '.rst', '.adoc')
    dep_files = {'package.json', 'package-lock.json', 'requirements.txt', 'poetry.lock', 'yarn.lock', 'pnpm-lock.yaml', 'pipfile', 'pipfile.lock'}

    def is_dep_manifest(f: str) -> bool:
        return os.path.basename(f.lower()) in dep_files

    is_docs = all(
        not is_dep_manifest(f) and (
            f.lower().endswith(docs_extensions) or
            f.lower().startswith('docs/') or
            '/docs/' in f.lower() or
            f.lower() == 'docs'
        )
        for f in modified_files
    )

    # 2. DEPENDENCY_BUMP: changes limited to package.json, package-lock.json, requirements.txt, or poetry.lock
    is_dep_bump = all(
        is_dep_manifest(f)
        for f in modified_files
    )

    # 3. TRIVIAL: single-line fixes or trivial file extensions
    trivial_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.gitignore', '.gitattributes', '.editorconfig', '.prettierrc', '.example')
    is_trivial_files = all(
        os.path.basename(f.lower()) in ('.gitignore', '.dockerignore') or f.lower().endswith(trivial_extensions)
        for f in modified_files
    )

    diff_changes = [
        l for l in raw_diff.splitlines()
        if (l.startswith("+") or l.startswith("-")) and not (l.startswith("+++") or l.startswith("---"))
    ]
    is_single_line_fix = len(diff_changes) <= 2 and len(modified_files) <= 1
    has_typo_keyword = any(kw in commit_str for kw in ["typo", "fix typo", "trivial", "minor typo"])

    # 4. CORE_LOGIC: any changes to core source code files (.py, .js, .ts, .go, etc.)
    core_extensions = ('.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.java', '.cpp', '.c', '.h', '.hpp', '.rs', '.rb', '.php', '.cs', '.html', '.css')
    has_core_file = any(
        f.lower().endswith(core_extensions)
        for f in modified_files
    )

    if is_docs:
        category = "DOCS"
        is_trivial = True
    elif is_dep_bump:
        category = "DEPENDENCY_BUMP"
        is_trivial = _is_pure_pin_dependency_change(raw_diff)
    elif is_trivial_files or (is_single_line_fix and (has_typo_keyword or not has_core_file)) or (has_typo_keyword and is_single_line_fix):
        category = "TRIVIAL"
        is_trivial = True
    elif has_core_file:
        category = "CORE_LOGIC"
        is_trivial = False
    else:
        category = "TRIVIAL"
        is_trivial = True

    return {
        "pr_category": category,
        "is_trivial": is_trivial
    }


def trivial_approval_node(state: AgentState) -> Dict[str, Any]:
    """
    Short-circuit node for trivial changes.

    Emits the canned LGTM only when the diff contains no secrets. If secrets
    are detected, the security alert becomes the final review so the change
    is never approved without secret scanning.
    """
    raw_diff = state.get("raw_diff", "")
    _, detected_secrets = scrub_secrets(raw_diff)

    if detected_secrets:
        secrets_str = ", ".join(detected_secrets)
        return {
            "final_review": (
                f"⚠️ SECURITY ALERT: Secrets detected in PR diff ({secrets_str})! "
                "Secrets have been scrubbed before LLM processing. Please immediately revoke and rotate these credentials."
            ),
            "has_leaked_secrets": True,
            "detected_secrets": detected_secrets,
        }

    return {
        "final_review": "LGTM - Trivial Change Bypassed Heavy Review"
    }
