import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Import after patching so imports within the module see mocked httpx
import importlib.util


def fetch_closed_bugs_from_module():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)
    # Mock httpx before module code runs
    spec.loader.exec_module(module)
    return module


def test_fetch_closed_bugs_calls_api_with_correct_params():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    mock_response = MagicMock()
    mock_response.json.return_value = []
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_response) as mock_get:
        spec.loader.exec_module(module)
        module.fetch_closed_bugs("owner/repo", "fake-token")

        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args[0][0] == "https://api.github.com/repos/owner/repo/issues"
        assert call_args[1]["headers"]["Authorization"] == "Bearer fake-token"
        assert call_args[1]["params"]["state"] == "closed"
        assert call_args[1]["params"]["labels"] == "bug"


def test_fetch_closed_bugs_filters_out_pull_requests():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    issues = [
        {"number": 1, "title": "Real bug", "body": "description", "pull_request": {}},
        {"number": 2, "title": "Another bug", "body": "desc"},
        {"number": 3, "title": "PR disguised", "body": "fake", "pull_request": {"url": "..."}},
    ]

    mock_response = MagicMock()
    mock_response.json.return_value = issues
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_response):
        spec.loader.exec_module(module)
        result = module.fetch_closed_bugs("owner/repo", "token")

    assert len(result) == 1
    assert result[0]["number"] == 2


def test_fetch_closed_bugs_returns_empty_list_on_error():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    with patch("httpx.get", side_effect=Exception("Network error")):
        spec.loader.exec_module(module)
        result = module.fetch_closed_bugs("owner/repo", "token")

    assert result == []


def test_run_cron_exits_early_when_token_missing():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    with patch.dict(os.environ, {}, clear=True):
        with patch("builtins.print") as mock_print:
            spec.loader.exec_module(module)
            module.run_cron("owner/repo")
            mock_print.assert_called()
            assert "not set" in mock_print.call_args[0][0]


def test_run_cron_skips_prs_when_building_chunks():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    issues = [
        {"number": 1, "title": "Bug A", "body": "Fix description", "pull_request": {}},
        {"number": 2, "title": "Bug B", "body": "Another fix"},
    ]

    with patch.dict(os.environ, {"GITHUB_TOKEN": "fake"}):
        with patch.object(module, "fetch_closed_bugs", return_value=issues):
            with patch.object(module.rag, "upsert_chunks", return_value=1) as mock_upsert:
                spec.loader.exec_module(module)
                module.run_cron("owner/repo")

                # Should only upsert the non-PR issue
                mock_upsert.assert_called_once()
                _, kwargs = mock_upsert.call_args
                assert kwargs.get("repo_url") == "https://github.com/owner/repo"


def test_chunk_text_format():
    spec = importlib.util.spec_from_file_location(
        "bug_pattern_cron", "/workspace/ai-code-reviewer/ai-engine/bug_pattern_cron.py"
    )
    module = importlib.util.module_from_spec(spec)

    issues = [
        {"number": 42, "title": "Null pointer crash", "body": "Was caused by uninitialized variable", "pull_request": {}},
    ]

    with patch.dict(os.environ, {"GITHUB_TOKEN": "fake"}):
        with patch.object(module, "fetch_closed_bugs", return_value=issues):
            with patch.object(module.rag, "upsert_chunks", return_value=1) as mock_upsert:
                spec.loader.exec_module(module)
                module.run_cron("owner/repo")

                mock_upsert.assert_called_once()
                chunks = mock_upsert.call_args[0][0]
                assert chunks[0] == "Bug #42: Null pointer crash\n\nWas caused by uninitialized variable"

                metadatas = mock_upsert.call_args[0][1]
                assert metadatas[0]["source_file"] == "issue_42"
                assert metadatas[0]["type"] == "historical_bug"
