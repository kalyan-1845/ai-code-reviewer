import pytest
from diff_helper import (
    get_changed_files_from_git,
    filter_files_by_changes,
    format_diff_header
)
from app import FileItem


class TestGetChangedFilesFromGit:
    def test_get_changed_files_empty_diff(self):
        result = get_changed_files_from_git("HEAD", "HEAD")
        assert isinstance(result, set)

    def test_get_changed_files_returns_set(self):
        result = get_changed_files_from_git("main", "feat/test")
        assert isinstance(result, set)


class TestFilterFilesByChanges:
    def test_filter_files_all_changed(self):
        files = [
            FileItem(name="file1.py", content="print('hello')"),
            FileItem(name="file2.py", content="print('world')")
        ]
        changed_files = {"file1.py", "file2.py"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 2
        assert skipped == 0

    def test_filter_files_some_changed(self):
        files = [
            FileItem(name="file1.py", content="print('hello')"),
            FileItem(name="file2.py", content="print('world')"),
            FileItem(name="file3.py", content="print('!')")
        ]
        changed_files = {"file1.py"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 1
        assert skipped == 2
        assert filtered[0].name == "file1.py"

    def test_filter_files_none_changed(self):
        files = [
            FileItem(name="file1.py", content="print('hello')"),
            FileItem(name="file2.py", content="print('world')")
        ]
        changed_files = set()
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 0
        assert skipped == 2

    def test_filter_files_empty_list(self):
        files = []
        changed_files = {"file1.py"}
        filtered, skipped = filter_files_by_changes(files, changed_files)
        assert len(filtered) == 0
        assert skipped == 0


class TestFormatDiffHeader:
    def test_format_diff_header_with_refs(self):
        header = format_diff_header(3, 147, "main", "feat/fix")
        assert "3 changed files" in header
        assert "147 unchanged files" in header
        assert "main" in header
        assert "feat/fix" in header

    def test_format_diff_header_without_refs(self):
        header = format_diff_header(5, 50)
        assert "5 changed files" in header
        assert "50 unchanged files" in header

    def test_format_diff_header_zero_skipped(self):
        header = format_diff_header(10, 0, "main", "develop")
        assert "10 changed files" in header
        assert "0 unchanged files" in header

    def test_format_diff_header_single_file(self):
        header = format_diff_header(1, 99, "base", "head")
        assert "1 changed files" in header
        assert "99 unchanged files" in header


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
