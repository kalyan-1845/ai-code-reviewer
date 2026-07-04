"""
Unit tests for ai-engine/diff_helper.py pure utility functions.

Covers:
- filter_files_by_changes: filters a list of FileItem objects by changed set
- format_diff_header: formats a human-readable diff-mode report header
"""
import pytest
from diff_helper import filter_files_by_changes, format_diff_header


class TestFilterFilesByChanges:
    """Tests for filter_files_by_changes function."""

    def test_empty_files_list_returns_empty(self):
        """Empty files list should return empty result with 0 skipped."""
        files = []
        changed_files = {"src/index.js"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert filtered == []
        assert skipped == 0

    def test_empty_changed_files_returns_all_skipped(self):
        """Empty changed_files set should skip all files."""
        files = [
            type("FileItem", (), {"name": "a.js"})(),
            type("FileItem", (), {"name": "b.js"})(),
        ]
        changed_files = set()
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert filtered == []
        assert skipped == 2

    def test_partial_overlap_filters_correctly(self):
        """Only files in the changed set should be retained."""
        files = [
            type("FileItem", (), {"name": "src/index.js"})(),
            type("FileItem", (), {"name": "src/utils.js"})(),
            type("FileItem", (), {"name": "src/style.css"})(),
        ]
        changed_files = {"src/index.js", "src/style.css"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 2
        assert skipped == 1
        names = {f.name for f in filtered}
        assert names == {"src/index.js", "src/style.css"}

    def test_no_overlap_returns_all_skipped(self):
        """No files match changed set: all should be skipped."""
        files = [
            type("FileItem", (), {"name": "docs/readme.md"})(),
            type("FileItem", (), {"name": "tests/test.js"})(),
        ]
        changed_files = {"src/main.js", "src/app.js"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert filtered == []
        assert skipped == 2

    def test_all_files_changed(self):
        """When changed_files contains all files, nothing is skipped."""
        files = [
            type("FileItem", (), {"name": "a.py"})(),
            type("FileItem", (), {"name": "b.py"})(),
        ]
        changed_files = {"a.py", "b.py"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 2
        assert skipped == 0

    def test_duplicate_names_in_files_not_de_duplicated(self):
        """If files list has duplicate names, both are kept when in changed set."""
        files = [
            type("FileItem", (), {"name": "file.js"})(),
            type("FileItem", (), {"name": "file.js"})(),
        ]
        changed_files = {"file.js"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 2
        assert skipped == 0


class TestFormatDiffHeader:
    """Tests for format_diff_header function."""

    def test_zero_reviewed_zero_skipped(self):
        """Zero values should produce a valid header."""
        result = format_diff_header(0, 0)
        assert "0 changed files" in result
        assert "Skipped: 0 unchanged files" in result

    def test_normal_values(self):
        """Normal counts should appear in the header."""
        result = format_diff_header(5, 3)
        assert "reviewing 5 changed files" in result
        assert "Skipped: 3 unchanged files" in result

    def test_with_base_and_head(self):
        """When base and head are provided they should appear in the header."""
        result = format_diff_header(10, 2, base="main", head="feat/login")
        assert "base: main" in result
        assert "head: feat/login" in result
        assert "reviewing 10 changed files" in result

    def test_with_base_only(self):
        """When only base is provided it appears in the header (head may be empty)."""
        result = format_diff_header(7, 1, base="develop")
        assert "base: develop" in result

    def test_with_head_only(self):
        """When only head is provided it appears in the header (base may be empty)."""
        result = format_diff_header(4, 0, head="bugfix/null")
        assert "head: bugfix/null" in result

    def test_large_counts(self):
        """Large numbers should be formatted as plain integers."""
        result = format_diff_header(1000, 5000)
        assert "reviewing 1000 changed files" in result
        assert "Skipped: 5000 unchanged files" in result
