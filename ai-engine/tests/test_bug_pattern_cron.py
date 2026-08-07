import importlib.util
import os
from unittest.mock import patch, MagicMock

import pytest

BUG_PATTERN_CRON_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "bug_pattern_cron.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location("bug_pattern_cron", BUG_PATTERN_CRON_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_fetch_closed_bugs_calls_api_with_correct_params():
    module = load_module()

    mock_response = MagicMock()
    mock_response.json.return_value = []
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_response) as mock_get:
        module.fetch_closed_bugs("owner/repo", "fake-token")

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args[0][0] == "https://api.github.com/repos/owner/repo/issues"
        assert call_args[1]["headers"]["Authorization"] == "Bearer fake-token"
        assert call_args[1]["params"]["state"] == "closed"
        assert call_args[1]["params"]["labels"] == "bug"


def test_fetch_closed_bugs_filters_out_pull_requests():
    module = load_module()

    issues = [
        {"number": 1, "title": "Real bug", "body": "description", "pull_request": {}},
        {"number": 2, "title": "Another bug", "body": "desc"},
        {"number": 3, "title": "PR disguised", "body": "fake", "pull_request": {"url": "..."}},
    ]

    mock_response = MagicMock()
    mock_response.json.return_value = issues
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_response):
        result = module.fetch_closed_bugs("owner/repo", "token")

    assert len(result) == 1
    assert result[0]["number"] == 2


def test_fetch_closed_bugs_returns_empty_list_on_error():
    module = load_module()

    with patch("httpx.get", side_effect=Exception("Network error")):
        result = module.fetch_closed_bugs("owner/repo", "token")

    assert result == []


def test_run_cron_exits_early_when_token_missing():
    module = load_module()

    with patch.dict(os.environ, {}, clear=True):
        with patch("builtins.print") as mock_print:
            module.run_cron("owner/repo")
            mock_print.assert_called()
            assert "not set" in mock_print.call_args[0][0]


def test_run_cron_skips_prs_when_building_chunks():
    module = load_module()

    issues = [
        {"number": 1, "title": "Bug A", "body": "Fix description", "pull_request": {}},
        {"number": 2, "title": "Bug B", "body": "Another fix"},
    ]

    with patch.dict(os.environ, {"GITHUB_TOKEN": "fake"}):
        with patch.object(module, "fetch_closed_bugs", return_value=issues):
            with patch.object(module.rag, "upsert_chunks", return_value=1) as mock_upsert:
                module.run_cron("owner/repo")

                # Should only upsert the non-PR issue
                mock_upsert.assert_called_once()
                _, kwargs = mock_upsert.call_args
                assert kwargs.get("repo_url") == "https://github.com/owner/repo"


def test_chunk_text_format():
    module = load_module()

    issues = [
        {"number": 42, "title": "Null pointer crash", "body": "Was caused by uninitialized variable"},
    ]

    with patch.dict(os.environ, {"GITHUB_TOKEN": "fake"}):
        with patch.object(module, "fetch_closed_bugs", return_value=issues):
            with patch.object(module.rag, "upsert_chunks", return_value=1) as mock_upsert:
                module.run_cron("owner/repo")

                mock_upsert.assert_called_once()
                chunks = mock_upsert.call_args[0][0]
                assert chunks[0] == "Bug #42: Null pointer crash\n\nWas caused by uninitialized variable"

                metadatas = mock_upsert.call_args[0][1]
                assert metadatas[0]["source_file"] == "issue_42"
                assert metadatas[0]["type"] == "historical_bug"
