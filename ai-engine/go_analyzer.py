"""
go_analyzer.py

Go-specific static analysis pipeline using `go vet` and `staticcheck`.

The rest of the review pipeline in app.py is a single generic LLM prompt
across all languages. Go has first-class static analysis tools that catch
real bugs (nil dereferences, wrong format strings, incorrect mutex usage)
that a generic LLM pass over source text routinely misses, so `.go` files
are additionally run through this dedicated pipeline and the findings are
merged into the same fileReviews schema the rest of the app already uses.
"""

import re
import subprocess
import tempfile
import os
from typing import Optional


def is_go_file(filename: str, content: str) -> bool:
    """
    A file is treated as Go source if it has a `.go` extension AND its
    first non-blank, non-comment line is a `package` declaration. The
    extension alone isn't sufficient — this mirrors the same
    renamed/misclassified-file concern raised elsewhere in this project's
    language detection (see #1677): a `.go` extension on a file that isn't
    actually Go source shouldn't be handed to the Go toolchain.
    """
    if not filename.lower().endswith(".go"):
        return False

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("//") or stripped.startswith("/*"):
            continue
        return stripped.startswith("package ") or stripped == "package"

    return False


# `go vet` reports one finding per line to stderr:
#   ./file.go:12:5: message text here
# On Windows the temp-file path includes a drive letter (C:\...) so the regex
# must allow an optional drive-letter prefix before the file path.
_GO_VET_LINE_RE = re.compile(r"^(?:\./)?(?:[A-Za-z]:)?(?P<file>[^:]+):(?P<line>\d+):(?P<col>\d+):\s*(?P<message>.+)$")


def parse_go_vet_output(stderr: str, display_filename: Optional[str] = None) -> list[dict]:
    """
    Parse `go vet`'s stderr into findings. Every go vet finding is treated
    as `error` severity, since vet only reports things it's confident are
    genuine bugs (unlike staticcheck's broader suggestion/style output).
    """
    findings = []
    if not stderr:
        return findings

    for raw_line in stderr.splitlines():
        match = _GO_VET_LINE_RE.match(raw_line.strip())
        if not match:
            continue
        findings.append({
            "file": display_filename or match.group("file"),
            "line": int(match.group("line")),
            "column": int(match.group("col")),
            "severity": "error",
            "rule": "go-vet",
            "message": match.group("message").strip(),
        })
    return findings


# staticcheck's default text output format:
#   file.go:12:5: message text (SA1019)
_STATICCHECK_LINE_RE = re.compile(
    r"^(?:\./)?(?:[A-Za-z]:)?(?P<file>[^:]+):(?P<line>\d+):(?P<col>\d+):\s*(?P<message>.+?)\s*\((?P<category>[A-Z]+\d+)\)\s*$"
)


def _staticcheck_severity(category: str) -> str:
    """
    Map a staticcheck category prefix to a severity:
      SA (staticcheck analysis) -> error   — actual bugs (nil derefs, etc.)
      ST (style)                -> style   — naming/formatting conventions
      S  (everything else, e.g. simplification suggestions) -> suggestion
    """
    if category.startswith("SA"):
        return "error"
    if category.startswith("ST"):
        return "style"
    return "suggestion"


def parse_staticcheck_output(stdout: str, display_filename: Optional[str] = None) -> list[dict]:
    """Parse staticcheck's default (non-JSON) stdout into findings."""
    findings = []
    if not stdout:
        return findings

    for raw_line in stdout.splitlines():
        match = _STATICCHECK_LINE_RE.match(raw_line.strip())
        if not match:
            continue
        category = match.group("category")
        findings.append({
            "file": display_filename or match.group("file"),
            "line": int(match.group("line")),
            "column": int(match.group("col")),
            "severity": _staticcheck_severity(category),
            "rule": f"staticcheck:{category}",
            "message": match.group("message").strip(),
        })
    return findings


def run_go_analysis(filepath: str, display_filename: Optional[str] = None) -> dict:
    """
    Run `go vet` and, if available, `staticcheck` against a Go source file
    on disk. Missing `staticcheck` degrades gracefully to vet-only output
    with a note, rather than failing the whole analysis.
    """
    result = {
        "vet": [],
        "staticcheck": [],
        "staticcheck_available": True,
        "note": None,
    }

    try:
        vet_proc = subprocess.run(
            ["go", "vet", filepath],
            capture_output=True,
            text=True,
            timeout=30,
        )
        result["vet"] = parse_go_vet_output(vet_proc.stderr, display_filename)
    except FileNotFoundError:
        result["note"] = "The `go` toolchain is not installed on this engine; Go static analysis was skipped entirely."
        result["staticcheck_available"] = False
        return result
    except subprocess.TimeoutExpired:
        result["note"] = "`go vet` timed out; Go static analysis was skipped for this file."
        return result

    try:
        static_proc = subprocess.run(
            ["staticcheck", filepath],
            capture_output=True,
            text=True,
            timeout=30,
        )
        result["staticcheck"] = parse_staticcheck_output(static_proc.stdout, display_filename)
    except FileNotFoundError:
        result["staticcheck_available"] = False
        result["note"] = "`staticcheck` is not installed on this engine; only `go vet` results are included."
    except subprocess.TimeoutExpired:
        result["staticcheck_available"] = False
        result["note"] = "`staticcheck` timed out; only `go vet` results are included."

    return result


def analyze_go_source(filename: str, content: str) -> dict:
    """
    Convenience wrapper: writes `content` to a temp file and runs the full
    Go analysis pipeline against it, returning results keyed by the
    original `filename` regardless of the temp path used on disk.
    """
    with tempfile.NamedTemporaryFile(mode="w", suffix=".go", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        return run_go_analysis(tmp_path, display_filename=filename)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


_SEVERITY_TO_CATEGORY = {
    "error": "bugs",
    "suggestion": "optimization",
    "style": "styling",
}


def go_findings_to_file_review(go_result: dict) -> dict:
    """
    Convert run_go_analysis()'s output into the same
    {bugs, security, optimization, styling} shape /analyze already produces
    for LLM-reviewed files, so Go findings merge into the existing report
    structure instead of requiring a separate schema downstream.
    """
    review = {"bugs": [], "security": [], "optimization": [], "styling": []}

    for finding in go_result.get("vet", []) + go_result.get("staticcheck", []):
        category = _SEVERITY_TO_CATEGORY.get(finding["severity"], "bugs")
        review[category].append({
            "type": finding["rule"],
            "line": finding["line"],
            "description": finding["message"],
            "suggestion": "",
        })

    note = go_result.get("note")
    if note and not go_result.get("staticcheck_available", True):
        review["styling"].append({
            "type": "go-analysis-note",
            "line": 1,
            "description": note,
            "suggestion": "Install `staticcheck` (go install honnef.co/go/tools/cmd/staticcheck@latest) on the analysis engine for deeper Go findings.",
        })

    return review
