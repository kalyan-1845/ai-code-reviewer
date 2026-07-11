"""
Unit tests for ai-engine/diff_helper.py pure utility functions and error paths.

Covers:
- filter_files_by_changes: filters a list of FileItem objects by changed set
- format_diff_header: formats a human-readable diff-mode report header
- get_changed_files_from_git: error-handling paths (subprocess failures)
- get_changed_files_from_github_pr: error-handling paths (network failures)
"""
import pytest
from diff_helper import (
    get_changed_files_from_git,
    filter_files_by_changes,
    format_diff_header,
    get_changed_files_from_github_pr
)
from app import FileItem


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


class TestGetChangedFilesFromGitErrorHandling:
    """Error-handling tests for get_changed_files_from_git using subprocess mocking."""

    def test_returns_empty_set_on_called_process_error(self):
        """CalledProcessError (e.g. git not a repo) should return empty set."""
        import subprocess
        import diff_helper
        original_run = subprocess.run

        def fake_run(*args, **kwargs):
            err = subprocess.CalledProcessError(1, 'git diff')
            err.stderr = 'fatal: not a git repository'
            raise err

        diff_helper.subprocess.run = fake_run
        try:
            result = get_changed_files_from_git('main', 'HEAD')
            assert result == set()
        finally:
            diff_helper.subprocess.run = original_run

    def test_returns_empty_set_on_file_not_found(self):
        """FileNotFoundError (git binary missing) should return empty set."""
        import subprocess
        import diff_helper
        original_run = subprocess.run

        def fake_run(*args, **kwargs):
            raise FileNotFoundError('git not found')

        diff_helper.subprocess.run = fake_run
        try:
            result = get_changed_files_from_git('main', 'HEAD')
            assert result == set()
        finally:
            diff_helper.subprocess.run = original_run


class TestGetChangedFilesFromGithubPrErrorHandling:
    """Error-handling tests for get_changed_files_from_github_pr using requests mocking."""

    def test_returns_empty_set_on_request_exception(self):
        """Network failure (RequestException) should return empty set."""
        import requests
        import diff_helper
        original_get = requests.get

        def fake_get(*args, **kwargs):
            raise requests.exceptions.RequestException('connection failed')

        diff_helper.requests.get = fake_get
        try:
            result = get_changed_files_from_github_pr(
                'owner', 'repo', 123, 'fake_token'
            )
            assert result == set()
        finally:
            diff_helper.requests.get = original_get

    def test_returns_empty_set_on_http_error(self):
        """Non-200 HTTP response should return empty set."""
        import requests
        import diff_helper
        original_get = requests.get

        class FakeResponse:
            def raise_for_status(self):
                raise requests.exceptions.HTTPError('404 Not Found')
            def json(self):
                return []

        def fake_get(*args, **kwargs):
            return FakeResponse()

        diff_helper.requests.get = fake_get
        try:
            result = get_changed_files_from_github_pr(
                'owner', 'repo', 123, 'fake_token'
            )
            assert result == set()
        finally:
            diff_helper.requests.get = original_get

    def test_skips_files_with_missing_filename(self):
        """File entries with no filename key should be skipped."""
        import requests
        import diff_helper
        original_get = requests.get

        page_count = [0]
        class FakeResponse:
            def raise_for_status(self):
                pass
            def json(self):
                page_count[0] += 1
                if page_count[0] == 1:
                    # First page: one entry has no filename key
                    return [{'status': 'modified'}, {'filename': 'valid.py'}]
                return []  # Empty page ends pagination

        def fake_get(*args, **kwargs):
            return FakeResponse()

        diff_helper.requests.get = fake_get
        try:
            result = get_changed_files_from_github_pr(
                'owner', 'repo', 123, 'fake_token'
            )
            assert result == {'valid.py'}
        finally:
            diff_helper.requests.get = original_get

    def test_returns_empty_set_on_unexpected_exception(self):
        """Unexpected exception should return empty set (defensive)."""
        import diff_helper
        original_get = diff_helper.requests.get

        def fake_get(*args, **kwargs):
            raise RuntimeError('unexpected error')

        diff_helper.requests.get = fake_get
        try:
            result = get_changed_files_from_github_pr(
                'owner', 'repo', 123, 'fake_token'
            )
            assert result == set()
        finally:
            diff_helper.requests.get = original_get
