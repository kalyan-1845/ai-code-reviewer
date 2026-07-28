from unittest.mock import patch, MagicMock
import pytest
import bug_pattern_cron
import uuid

@patch("bug_pattern_cron.httpx.get")
def test_fetch_closed_bugs_success(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = [{"number": 1, "title": "Test Bug", "body": "Details"}]
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    bugs = bug_pattern_cron.fetch_closed_bugs("test/repo", "fake_token")
    assert len(bugs) == 1
    assert bugs[0]["number"] == 1

@patch("bug_pattern_cron.httpx.get")
def test_fetch_closed_bugs_failure(mock_get):
    mock_get.side_effect = Exception("Network error")
    bugs = bug_pattern_cron.fetch_closed_bugs("test/repo", "fake_token")
    assert bugs == []

@patch("bug_pattern_cron.rag.upsert_chunks")
@patch("bug_pattern_cron.fetch_closed_bugs")
@patch("os.getenv")
def test_run_cron(mock_getenv, mock_fetch, mock_upsert):
    mock_getenv.return_value = "fake_token"
    mock_fetch.return_value = [
        {"number": 101, "title": "Memory leak", "body": "Fix it"},
        {"number": 102, "title": "Ignore PR", "pull_request": {}}
    ]
    mock_upsert.return_value = 1
    
    bug_pattern_cron.run_cron("test/repo")
    
    mock_upsert.assert_called_once()
    args, kwargs = mock_upsert.call_args
    chunks, metadatas, ids = args
    assert len(chunks) == 1
    assert "Memory leak" in chunks[0]
    assert metadatas[0]["source_file"] == "issue_101"
    assert kwargs["repo_url"] == "https://github.com/test/repo"
