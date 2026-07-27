"""Tests for the /chat-inline endpoint in app.py."""
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app, verify_api_key


# Override auth dependency so tests work without real API key
app.dependency_overrides[verify_api_key] = lambda: "test-user"

client = TestClient(app)


def _mock_groq_response(content='{"reply": "Looks good to me!"}'):
    """Return a mock Groq completion response."""
    mock_choice = MagicMock()
    mock_choice.message.content = content
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    return mock_completion


class TestChatInlineEndpoint:
    def test_returns_200_with_valid_request(self):
        mock_completion = _mock_groq_response()
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+def hello():\n    print('world')",
                            "message": "Is this function correct?"
                        }
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert "reply" in data
                    assert data["reply"] == "Looks good to me!"
        finally:
            app_module.groq_client = original_client

    def test_returns_422_when_message_field_missing(self):
        response = client.post(
            "/chat-inline",
            json={
                "file_path": "src/main.py",
                "diff_hunk": "+x = 1"
            }
        )
        assert response.status_code == 422

    def test_returns_422_when_file_path_missing(self):
        response = client.post(
            "/chat-inline",
            json={
                "diff_hunk": "+x = 1",
                "message": "Hello"
            }
        )
        assert response.status_code == 422

    def test_returns_500_when_groq_not_configured(self):
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = None
            response = client.post(
                "/chat-inline",
                json={
                    "file_path": "src/main.py",
                    "diff_hunk": "+x = 1",
                    "message": "Hello"
                }
            )
            assert response.status_code == 500
            assert "not configured" in response.json()["detail"]
        finally:
            app_module.groq_client = original_client

    def test_returns_502_when_llm_returns_empty_response(self):
        mock_completion = _mock_groq_response(content=None)
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+x = 1",
                            "message": "Hello"
                        }
                    )
                    assert response.status_code == 502
        finally:
            app_module.groq_client = original_client

    def test_accepts_optional_context_parameter(self):
        mock_completion = _mock_groq_response(content='{"reply": "With context"}')
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+x = 1",
                            "message": "Hello",
                            "context": "Previous discussion thread"
                        }
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert "reply" in data
        finally:
            app_module.groq_client = original_client

    def test_response_json_has_expected_keys(self):
        mock_completion = _mock_groq_response(content='{"reply": "Good code"}')
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+x = 1",
                            "message": "Is this correct?"
                        }
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert "reply" in data
        finally:
            app_module.groq_client = original_client

    def test_handles_malformed_json_response(self):
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock(message=MagicMock(content="not json"))]
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+x = 1",
                            "message": "Hello"
                        }
                    )
                    assert response.status_code == 500
        finally:
            app_module.groq_client = original_client

    def test_uses_default_model_when_not_specified(self):
        mock_completion = _mock_groq_response()
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
                with patch("app.get_groq_model", return_value="llama-3.3-70b-versatile"):
                    mock_call.return_value = mock_completion
                    response = client.post(
                        "/chat-inline",
                        json={
                            "file_path": "src/main.py",
                            "diff_hunk": "+x = 1",
                            "message": "Hello"
                        }
                    )
                    assert response.status_code == 200
        finally:
            app_module.groq_client = original_client
