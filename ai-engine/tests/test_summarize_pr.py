"""Tests for the /summarize-pr endpoint in app.py."""
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


def _mock_groq_response(content='{"summary": "- Added feature X\\n- Refactored Y"}'):
    mock_choice = MagicMock()
    mock_choice.message.content = content
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    return mock_completion


class TestSummarizePrEndpoint:
    def test_returns_summary_when_groq_returns_valid_response(self):
        mock_completion = _mock_groq_response()
        import app as app_module
        original = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            async def fake_call(**kwargs):
                return mock_completion
            with patch.object(app_module, '_call_groq_with_timeout', fake_call):
                response = client.post(
                    "/summarize-pr",
                    json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
                )
                assert response.status_code == 200
                data = response.json()
                assert "summary" in data
        finally:
            app_module.groq_client = original

    def test_returns_500_when_groq_not_configured(self):
        import app as app_module
        original = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = None
            response = client.post(
                "/summarize-pr",
                json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
            )
            assert response.status_code == 500
            assert "not configured" in response.json()["detail"]
        finally:
            app_module.groq_client = original

    def test_returns_200_when_summary_key_missing(self):
        """When LLM returns JSON missing the 'summary' key, return empty summary."""
        mock_completion = _mock_groq_response(content='{"other": "value"}')
        import app as app_module
        original = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            async def fake_call(**kwargs):
                return mock_completion
            with patch.object(app_module, '_call_groq_with_timeout', fake_call):
                response = client.post(
                    "/summarize-pr",
                    json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
                )
                assert response.status_code == 200
                assert response.json()["summary"] == ""
        finally:
            app_module.groq_client = original

    def test_rejects_missing_diff_field(self):
        """Request validation - missing required 'diff' field returns 422."""
        response = client.post("/summarize-pr", json={})
        assert response.status_code == 422

    def test_accepts_empty_diff_string(self):
        """An empty diff string is valid input."""
        mock_completion = _mock_groq_response(content='{"summary": ""}')
        import app as app_module
        original = getattr(app_module, 'groq_client', None)
        try:
            app_module.groq_client = MagicMock()
            async def fake_call(**kwargs):
                return mock_completion
            with patch.object(app_module, '_call_groq_with_timeout', fake_call):
                response = client.post("/summarize-pr", json={"diff": ""})
                assert response.status_code == 200
        finally:
            app_module.groq_client = original
