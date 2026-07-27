"""Tests for the /summarize-pr endpoint in app.py."""
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


class TestSummarizePrEndpoint:
    def test_returns_summary_when_groq_returns_valid_response(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"summary": "- Added feature X\\n- Refactored Y"}'))
        ]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create = MagicMock(return_value=mock_completion)

        with patch("app.groq_client", mock_groq):
            response = client.post(
                "/summarize-pr",
                json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
            )
            assert response.status_code == 200
            data = response.json()
            assert "summary" in data

    def test_returns_500_when_groq_not_configured(self):
        with patch("app.groq_client", None):
            response = client.post(
                "/summarize-pr",
                json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
            )
            assert response.status_code == 500
            assert "not configured" in response.json()["detail"]

    def test_returns_502_when_groq_returns_empty_response(self):
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock(message=MagicMock(content=None))]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create = MagicMock(return_value=mock_completion)

        with patch("app.groq_client", mock_groq):
            response = client.post(
                "/summarize-pr",
                json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
            )
            assert response.status_code == 502

    def test_returns_200_when_summary_key_missing(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"other": "value"}'))
        ]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create = MagicMock(return_value=mock_completion)

        with patch("app.groq_client", mock_groq):
            response = client.post(
                "/summarize-pr",
                json={"diff": "diff --git a/x.py b/x.py\n+print('hello')"}
            )
            assert response.status_code == 200
            assert response.json()["summary"] == ""

    def test_rejects_missing_diff_field(self):
        response = client.post("/summarize-pr", json={})
        assert response.status_code == 422

    def test_accepts_empty_diff_string(self):
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content='{"summary": ""}'))
        ]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create = MagicMock(return_value=mock_completion)

        with patch("app.groq_client", mock_groq):
            response = client.post("/summarize-pr", json={"diff": ""})
            assert response.status_code == 200
