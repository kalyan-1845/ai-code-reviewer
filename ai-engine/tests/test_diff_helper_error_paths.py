"""
Unit tests for error-handling code paths in ai-engine/diff_helper.py.

The existing tests in test_diff_helper.py cover the happy path for
get_changed_files_from_git.  These tests cover the exception handlers:
  - subprocess.CalledProcessError  -> returns empty set
  - FileNotFoundError (git not in PATH) -> returns empty set
  - generic Exception             -> returns empty set
"""
import pytest
from unittest.mock import patch, MagicMock
from diff_helper import get_changed_files_from_git


class TestGetChangedFilesFromGitErrorPaths:
    """Error-handling tests for get_changed_files_from_git."""

    def test_called_process_error_returns_empty_set(self):
        """CalledProcessError from git should be caught and return empty set."""
        with patch('diff_helper.subprocess.run') as mock_run:
            error = MagicMock()
            error.returncode = 128
            error.stderr = 'fatal: not a git repository'
            mock_run.side_effect = __import__('subprocess').CalledProcessError(
                returncode=128, cmd=['git', 'diff', '--name-only', 'HEAD...HEAD']
            )
            result = get_changed_files_from_git('HEAD', 'HEAD')
            assert result == set()

    def test_file_not_found_error_returns_empty_set(self):
        """FileNotFoundError when git binary is missing should return empty set."""
        with patch('diff_helper.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError('No such file or directory: git')
            result = get_changed_files_from_git('main', 'feat')
            assert result == set()

    def test_generic_exception_returns_empty_set(self):
        """Unexpected exceptions should be caught and return empty set."""
        with patch('diff_helper.subprocess.run') as mock_run:
            mock_run.side_effect = RuntimeError('unexpected failure')
            result = get_changed_files_from_git('main', 'HEAD')
            assert result == set()
