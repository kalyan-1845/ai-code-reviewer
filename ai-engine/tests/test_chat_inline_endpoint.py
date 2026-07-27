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


class TestChatInlineEndpoint:
    def test_returns_200_with_valid_request(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"reply": "Looks good to me!"}'))
        ]

        with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
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
        with patch("app.groq_client", None):
            response = client.post(
                "/chat-inline",
                json={
                    "file_path": "src/main.py",
                    "diff_hunk": "+x = 1",
                    "message": "Hello"
                }
            )
            assert response.status_code == 500

    def test_returns_502_when_llm_returns_empty_response(self):
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock(message=MagicMock(content=None))]

        with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
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

    def test_returns_500_when_json_parse_fails(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content="not valid json"))
        ]

        with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
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

    def test_accepts_optional_context_parameter(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"reply": "OK"}'))
        ]

        with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
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

    def test_response_json_has_expected_keys(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"reply": "Great code!"}'))
        ]

        with patch("app._call_groq_with_timeout", new_callable=AsyncMock) as mock_call:
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
            data = response.json()
            assert isinstance(data["reply"], str)
