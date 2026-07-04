"""
Unit tests for get_changed_files_from_github_pr in ai-engine/diff_helper.py.
"""
import pytest
from unittest.mock import patch, MagicMock
import diff_helper
from diff_helper import get_changed_files_from_github_pr


def _mock_response(json_data):
    """Build a mock requests.Response with raise_for_status stubbed out."""
    mr = MagicMock()
    mr.raise_for_status.return_value = None
    mr.json.return_value = json_data
    return mr


class TestGetChangedFilesFromGithubPr:

    def test_single_page_response_returns_set_of_files(self):
        # side_effect list must end with empty response to terminate while True loop.
        with patch('requests.get') as mock_get:
            mock_get.side_effect = [
                _mock_response([{'filename': 'src/main.py'}, {'filename': 'tests/test_main.py'}]),
                _mock_response([]),
            ]
            result = get_changed_files_from_github_pr('owner', 'repo', 42, 'ghp_testtoken')
            assert isinstance(result, set)
            assert result == {'src/main.py', 'tests/test_main.py'}

    def test_pagination_returns_all_files_across_pages(self):
        with patch('requests.get') as mock_get:
            mock_get.side_effect = [
                _mock_response([{'filename': 'file_a.py'}, {'filename': 'file_b.py'}]),
                _mock_response([{'filename': 'file_c.py'}]),
                _mock_response([]),
            ]
            result = get_changed_files_from_github_pr('owner', 'repo', 1, 'token')
            assert isinstance(result, set)
            assert len(result) == 3
            assert result == {'file_a.py', 'file_b.py', 'file_c.py'}

    def test_empty_response_returns_empty_set(self):
        with patch('requests.get') as mock_get:
            mock_get.side_effect = [_mock_response([])]
            result = get_changed_files_from_github_pr('owner', 'repo', 99, 'token')
            assert result == set()

    def test_request_exception_returns_empty_set(self):
        import requests as _req
        with patch('requests.get') as mock_get:
            mock_get.side_effect = _req.exceptions.ConnectionError('Connection refused')
            result = get_changed_files_from_github_pr('owner', 'repo', 1, 'token')
            assert result == set()

    def test_generic_exception_returns_empty_set(self):
        with patch('requests.get') as mock_get:
            mock_get.side_effect = RuntimeError('unexpected error')
            result = get_changed_files_from_github_pr('owner', 'repo', 1, 'token')
            assert result == set()

    def test_missing_filename_key_in_response_item_is_ignored(self):
        with patch('requests.get') as mock_get:
            mock_get.side_effect = [
                _mock_response([{'filename': 'valid.py'}, {}, {'other_key': 'value'}]),
                _mock_response([]),
            ]
            result = get_changed_files_from_github_pr('owner', 'repo', 1, 'token')
            assert result == {'valid.py'}
