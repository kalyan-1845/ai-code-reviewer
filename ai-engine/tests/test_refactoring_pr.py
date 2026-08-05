import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
import app as app_module

SERVICE_HEADERS = {"x-api-key": "test-ai-engine-key"}
client = TestClient(app_module.app, headers=SERVICE_HEADERS)

def _make_fake_completion(content: str):
    completion = MagicMock()
    completion.choices = [MagicMock(message=MagicMock(content=content))]
    return completion

def test_analyze_creates_refactoring_pr(monkeypatch):
    monkeypatch.setattr(app_module, "groq_client", MagicMock())
    
    async def fake_call_groq_with_timeout(**kwargs):
        payload = {
            "fileReviews": {"a.py": {"bugs": [], "security": [], "optimization": [], "styling": [], "impact": [], "architecture": []}},
            "refactoring_suggestions": [
                {
                    "file_path": "a.py",
                    "refactored_content": "print('refactored')",
                    "pr_title": "Test Refactor",
                    "pr_body": "Test PR Body"
                }
            ]
        }
        return _make_fake_completion(json.dumps(payload))
    
    monkeypatch.setattr(app_module, "_call_groq_with_timeout", fake_call_groq_with_timeout)

    mock_response_post = MagicMock()
    mock_response_post.status_code = 201
    mock_response_post.json.return_value = {"html_url": "https://github.com/test/repo/pull/1"}
    mock_post = AsyncMock(return_value=mock_response_post)
    
    mock_response_get = MagicMock()
    mock_response_get.status_code = 200
    mock_response_get.json.return_value = {"object": {"sha": "basesha123"}, "sha": "filesha123"}
    mock_get = AsyncMock(return_value=mock_response_get)
    
    mock_response_put = MagicMock()
    mock_response_put.status_code = 201
    mock_put = AsyncMock(return_value=mock_response_put)
    
    mock_client_instance = MagicMock()
    mock_client_instance.get = mock_get
    mock_client_instance.post = mock_post
    mock_client_instance.put = mock_put
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=None)
    
    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        payload = {
            "files": [{"name": "a.py", "content": "print(1)"}],
            "batchSize": 1,
            "githubToken": "fake-token",
            "headRef": "feature-branch",
            "repositoryContext": {"owner": "test", "repo": "repo"},
            "autoCreatePRs": True
        }
        response = client.post("/analyze", json=payload)
        
    assert response.status_code == 200
    data = response.json()
    assert "generated_pr_links" in data
    assert data["generated_pr_links"] == ["https://github.com/test/repo/pull/1"]


async def _fake_analyze_completion(**kwargs):
    return _make_fake_completion(json.dumps({
        "fileReviews": {"a.py": {"bugs": [], "security": [], "optimization": [], "styling": [], "impact": [], "architecture": []}},
        "refactoring_suggestions": [
            {
                "file_path": "a.py",
                "refactored_content": "print('refactored')",
                "pr_title": "Test Refactor",
                "pr_body": "Test PR Body"
            }
        ]
    }))


def _analyze_payload(**overrides):
    payload = {
        "files": [{"name": "a.py", "content": "print(1)"}],
        "batchSize": 1,
        "githubToken": "fake-token",
        "headRef": "feature-branch",
        "repositoryContext": {"owner": "test", "repo": "repo"},
    }
    payload.update(overrides)
    return payload


def test_analyze_does_not_create_pr_without_opt_in(monkeypatch):
    """Providing a GitHub token alone must never trigger PR creation."""
    monkeypatch.setattr(app_module, "groq_client", MagicMock())
    monkeypatch.setattr(app_module, "AUTO_CREATE_REFACTORING_PRS", False)
    monkeypatch.setattr(app_module, "_call_groq_with_timeout", _fake_analyze_completion)

    mock_create_pr = AsyncMock(return_value="https://github.com/test/repo/pull/1")
    monkeypatch.setattr(app_module, "_create_refactoring_pr", mock_create_pr)

    response = client.post("/analyze", json=_analyze_payload())

    assert response.status_code == 200
    data = response.json()
    assert "generated_pr_links" not in data
    mock_create_pr.assert_not_called()


def test_analyze_creates_pr_when_request_opt_in_flag_set(monkeypatch):
    """autoCreatePRs: true on the request is a valid explicit opt-in."""
    monkeypatch.setattr(app_module, "groq_client", MagicMock())
    monkeypatch.setattr(app_module, "AUTO_CREATE_REFACTORING_PRS", False)
    monkeypatch.setattr(app_module, "_call_groq_with_timeout", _fake_analyze_completion)

    mock_create_pr = AsyncMock(return_value="https://github.com/test/repo/pull/1")
    monkeypatch.setattr(app_module, "_create_refactoring_pr", mock_create_pr)

    response = client.post("/analyze", json=_analyze_payload(autoCreatePRs=True))

    assert response.status_code == 200
    data = response.json()
    assert data["generated_pr_links"] == ["https://github.com/test/repo/pull/1"]
    mock_create_pr.assert_awaited_once()


def test_analyze_creates_pr_when_server_env_flag_enabled(monkeypatch):
    """AUTO_CREATE_REFACTORING_PRS=true allows PR creation without per-request flag."""
    monkeypatch.setattr(app_module, "groq_client", MagicMock())
    monkeypatch.setattr(app_module, "AUTO_CREATE_REFACTORING_PRS", True)
    monkeypatch.setattr(app_module, "_call_groq_with_timeout", _fake_analyze_completion)

    mock_create_pr = AsyncMock(return_value="https://github.com/test/repo/pull/1")
    monkeypatch.setattr(app_module, "_create_refactoring_pr", mock_create_pr)

    response = client.post("/analyze", json=_analyze_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["generated_pr_links"] == ["https://github.com/test/repo/pull/1"]
    mock_create_pr.assert_awaited_once()
