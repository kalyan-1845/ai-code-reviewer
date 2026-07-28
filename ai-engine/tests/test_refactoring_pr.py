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
            "repositoryContext": {"owner": "test", "repo": "repo"}
        }
        response = client.post("/analyze", json=payload)
        
    assert response.status_code == 200
    data = response.json()
    assert "generated_pr_links" in data
    assert data["generated_pr_links"] == ["https://github.com/test/repo/pull/1"]
