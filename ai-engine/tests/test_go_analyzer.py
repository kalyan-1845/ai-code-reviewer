import subprocess
from unittest.mock import patch, MagicMock

import pytest

from go_analyzer import (
    is_go_file,
    parse_go_vet_output,
    parse_staticcheck_output,
    run_go_analysis,
    analyze_go_source,
    go_findings_to_file_review,
)


GO_SOURCE = """package main

import "fmt"

func main() {
\tfmt.Println("hello")
}
"""


class TestIsGoFile:
    def test_go_extension_with_package_declaration_is_go(self):
        assert is_go_file("main.go", GO_SOURCE) is True

    def test_go_extension_case_insensitive(self):
        assert is_go_file("main.GO", GO_SOURCE) is True

    def test_non_go_extension_is_not_go_even_with_package_line(self):
        assert is_go_file("main.txt", GO_SOURCE) is False

    def test_go_extension_without_package_declaration_is_not_go(self):
        # A renamed/misclassified file: .go extension, but not actually Go source.
        content = "This is just plain text, not a Go file.\nSecond line.\n"
        assert is_go_file("fake.go", content) is False

    def test_leading_blank_lines_and_comments_are_skipped(self):
        content = "\n\n// Copyright notice\n// more license text\n\npackage main\n"
        assert is_go_file("main.go", content) is True

    def test_block_comment_before_package_is_skipped(self):
        content = "/* license header */\npackage main\n"
        assert is_go_file("main.go", content) is True

    def test_empty_file_is_not_go(self):
        assert is_go_file("empty.go", "") is False


class TestParseGoVetOutput:
    def test_parses_single_finding(self):
        stderr = "./main.go:12:5: Println call has arguments but no formatting directives\n"
        findings = parse_go_vet_output(stderr)
        assert len(findings) == 1
        assert findings[0]["file"] == "main.go"
        assert findings[0]["line"] == 12
        assert findings[0]["column"] == 5
        assert findings[0]["severity"] == "error"
        assert findings[0]["rule"] == "go-vet"
        assert "formatting directives" in findings[0]["message"]

    def test_parses_multiple_findings(self):
        stderr = (
            "./main.go:12:5: first issue\n"
            "./utils.go:30:1: second issue\n"
        )
        findings = parse_go_vet_output(stderr)
        assert len(findings) == 2
        assert findings[0]["file"] == "main.go"
        assert findings[1]["file"] == "utils.go"

    def test_ignores_unparseable_lines(self):
        stderr = "go: some unrelated toolchain output\nexit status 1\n"
        findings = parse_go_vet_output(stderr)
        assert findings == []

    def test_empty_stderr_returns_empty_list(self):
        assert parse_go_vet_output("") == []

    def test_display_filename_overrides_parsed_path(self):
        stderr = "./tmp12345.go:12:5: some issue\n"
        findings = parse_go_vet_output(stderr, display_filename="src/main.go")
        assert findings[0]["file"] == "src/main.go"


class TestParseStaticcheckOutput:
    def test_sa_category_maps_to_error(self):
        stdout = "main.go:10:2: error is unused (SA9003)\n"
        findings = parse_staticcheck_output(stdout)
        assert len(findings) == 1
        assert findings[0]["severity"] == "error"
        assert findings[0]["rule"] == "staticcheck:SA9003"

    def test_st_category_maps_to_style(self):
        stdout = "main.go:5:1: error strings should not be capitalized (ST1005)\n"
        findings = parse_staticcheck_output(stdout)
        assert findings[0]["severity"] == "style"

    def test_s_only_category_maps_to_suggestion(self):
        stdout = "main.go:8:3: should merge variable declaration with assignment (S1021)\n"
        findings = parse_staticcheck_output(stdout)
        assert findings[0]["severity"] == "suggestion"

    def test_empty_stdout_returns_empty_list(self):
        assert parse_staticcheck_output("") == []

    def test_line_without_category_suffix_is_ignored(self):
        stdout = "Checking 3 packages...\n"
        assert parse_staticcheck_output(stdout) == []


class TestRunGoAnalysis:
    def test_missing_go_toolchain_degrades_gracefully(self):
        with patch("go_analyzer.subprocess.run", side_effect=FileNotFoundError()):
            result = run_go_analysis("somefile.go")
        assert result["vet"] == []
        assert result["staticcheck"] == []
        assert result["staticcheck_available"] is False
        assert "go" in result["note"].lower()

    def test_missing_staticcheck_falls_back_to_vet_only(self):
        vet_result = MagicMock(stderr="./somefile.go:3:1: some vet finding\n", stdout="")

        def fake_run(cmd, **kwargs):
            if cmd[0] == "go":
                return vet_result
            raise FileNotFoundError()

        with patch("go_analyzer.subprocess.run", side_effect=fake_run):
            result = run_go_analysis("somefile.go")

        assert len(result["vet"]) == 1
        assert result["staticcheck"] == []
        assert result["staticcheck_available"] is False
        assert "staticcheck" in result["note"].lower()

    def test_both_tools_available_returns_combined_findings(self):
        vet_result = MagicMock(stderr="./somefile.go:3:1: vet finding\n", stdout="")
        static_result = MagicMock(stdout="somefile.go:8:2: staticcheck finding (SA1019)\n", stderr="")

        def fake_run(cmd, **kwargs):
            return vet_result if cmd[0] == "go" else static_result

        with patch("go_analyzer.subprocess.run", side_effect=fake_run):
            result = run_go_analysis("somefile.go")

        assert len(result["vet"]) == 1
        assert len(result["staticcheck"]) == 1
        assert result["staticcheck_available"] is True
        assert result["note"] is None

    def test_go_vet_timeout_skips_analysis_with_note(self):
        with patch("go_analyzer.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="go vet", timeout=30)):
            result = run_go_analysis("somefile.go")
        assert result["vet"] == []
        assert "timed out" in result["note"].lower()


class TestAnalyzeGoSource:
    def test_writes_content_to_temp_file_and_uses_display_filename(self):
        vet_result = MagicMock(stderr="", stdout="")

        captured_paths = []

        def fake_run(cmd, **kwargs):
            captured_paths.append(cmd[-1])
            return vet_result

        with patch("go_analyzer.subprocess.run", side_effect=fake_run):
            result = analyze_go_source("main.go", GO_SOURCE)

        assert result["vet"] == []
        # The path passed to the subprocess is a temp file, not "main.go" literally.
        assert captured_paths[0].endswith(".go")
        assert captured_paths[0] != "main.go"

    def test_cleans_up_temp_file_after_analysis(self):
        import os

        created_path = {}

        original_run = subprocess.run

        def fake_run(cmd, **kwargs):
            created_path["path"] = cmd[-1]
            return MagicMock(stderr="", stdout="")

        with patch("go_analyzer.subprocess.run", side_effect=fake_run):
            analyze_go_source("main.go", GO_SOURCE)

        assert not os.path.exists(created_path["path"])


class TestGoFindingsToFileReview:
    def test_maps_error_severity_to_bugs(self):
        go_result = {
            "vet": [{"file": "main.go", "line": 1, "column": 1, "severity": "error", "rule": "go-vet", "message": "m"}],
            "staticcheck": [],
            "staticcheck_available": True,
            "note": None,
        }
        review = go_findings_to_file_review(go_result)
        assert len(review["bugs"]) == 1
        assert review["security"] == []
        assert review["optimization"] == []

    def test_maps_style_and_suggestion_severities(self):
        go_result = {
            "vet": [],
            "staticcheck": [
                {"file": "main.go", "line": 2, "column": 1, "severity": "style", "rule": "staticcheck:ST1005", "message": "m1"},
                {"file": "main.go", "line": 3, "column": 1, "severity": "suggestion", "rule": "staticcheck:S1021", "message": "m2"},
            ],
            "staticcheck_available": True,
            "note": None,
        }
        review = go_findings_to_file_review(go_result)
        assert len(review["styling"]) == 1
        assert len(review["optimization"]) == 1
        assert review["bugs"] == []

    def test_missing_staticcheck_note_appended_as_styling_entry(self):
        go_result = {"vet": [], "staticcheck": [], "staticcheck_available": False, "note": "staticcheck is not installed"}
        review = go_findings_to_file_review(go_result)
        assert len(review["styling"]) == 1
        assert "staticcheck" in review["styling"][0]["description"].lower()

    def test_no_findings_and_no_note_produces_empty_review(self):
        go_result = {"vet": [], "staticcheck": [], "staticcheck_available": True, "note": None}
        review = go_findings_to_file_review(go_result)
        assert review == {"bugs": [], "security": [], "optimization": [], "styling": []}
