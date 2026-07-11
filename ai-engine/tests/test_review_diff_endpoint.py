from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def _mock_groq_response(reviews=None):
    """Return a mock Groq completion response with optional reviews."""
    import json
    payload = {"reviews": reviews or []}
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(payload)
    mock_choice.message.role = "assistant"
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    return mock_completion


class TestReviewDiffEndpoint:
    def test_review_diff_returns_500_when_groq_not_configured(self):
        """When groq_client is None, the endpoint should return 500."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        app_module.groq_client = None

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {
                        "path": "src/main.py",
                        "changes": [{"line": 1, "content": "x = 1"}]
                    }
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 500
        finally:
            app_module.groq_client = original_client

    def test_review_diff_skips_files_with_empty_changes(self):
        """Files with an empty changes list should be skipped (no Groq call needed)."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {"path": "empty.py", "changes": []}
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["comments"] == []
            # Groq should not have been called since file was skipped
            assert mock_client.chat.completions.create.call_count == 0
        finally:
            app_module.groq_client = original_client

    def test_review_diff_returns_comments_from_llm_response(self):
        """Valid LLM JSON response with reviews should produce comments."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response([
            {
                "line": 12,
                "type": "bug",
                "comment": "### Bug\n\nClear description.\n\n#### Fix\n\n```python\n# corrected\n```"
            }
        ])
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {
                        "path": "src/main.py",
                        "changes": [{"line": 1, "content": "x = 1"}]
                    }
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            data = response.json()
            assert "comments" in data
            assert len(data["comments"]) == 1
            assert data["comments"][0]["path"] == "src/main.py"
            assert data["comments"][0]["line"] == 12
        finally:
            app_module.groq_client = original_client

    def test_review_diff_returns_empty_comments_when_llm_finds_nothing(self):
        """LLM returns {"reviews": []} — endpoint should return empty comments list."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response([])
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {
                        "path": "src/main.py",
                        "changes": [{"line": 1, "content": "x = valid_code()"}]
                    }
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["comments"] == []
        finally:
            app_module.groq_client = original_client

    def test_review_diff_handles_malformed_json_from_llm(self):
        """If LLM returns non-JSON, endpoint should not crash."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "This is not JSON output"
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_completion
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {
                        "path": "src/main.py",
                        "changes": [{"line": 1, "content": "x = 1"}]
                    }
                ],
                "model": "llama-3.3-70b-versatile"
            })
            # Should not crash; returns whatever comments were collected
            assert response.status_code == 200
            data = response.json()
            assert "comments" in data
        finally:
            app_module.groq_client = original_client

    def test_review_diff_handles_llm_response_with_reviews_in_unexpected_key(self):
        """LLM wraps reviews in unexpected key — endpoint falls back to list search."""
        import app as app_module
        import json
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({
            "result": [
                {"line": 5, "type": "style", "comment": "Style suggestion"}
            ]
        })
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_completion
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {"path": "style.css", "changes": [{"line": 1, "content": "body {}"}]}
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            data = response.json()
            assert "comments" in data
        finally:
            app_module.groq_client = original_client

    def test_review_diff_sanitizes_comment_body(self):
        """Comment bodies should be sanitized via sanitize_ai_output before returning."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response([
            {"line": 1, "type": "security", "comment": "<script>alert('xss')</script>"}
        ])
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {"path": "x.html", "changes": [{"line": 1, "content": "<script>evil()</script>"}]}
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            data = response.json()
            # Script tag should be stripped by sanitize_ai_output
            assert "<script>" not in data["comments"][0]["body"]
        finally:
            app_module.groq_client = original_client

    def test_review_diff_multiple_files_all_reviewed(self):
        """Multiple files with changes should each trigger a Groq call."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response([])
        app_module.groq_client = mock_client

        try:
            response = client.post("/review-diff", json={
                "files": [
                    {"path": "a.py", "changes": [{"line": 1, "content": "a"}]},
                    {"path": "b.py", "changes": [{"line": 1, "content": "b"}]},
                ],
                "model": "llama-3.3-70b-versatile"
            })
            assert response.status_code == 200
            # Two files with non-empty changes = two Groq calls
            assert mock_client.chat.completions.create.call_count == 2
        finally:
            app_module.groq_client = original_client
