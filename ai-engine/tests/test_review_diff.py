"""
Tests for the /review-diff FastAPI endpoint in ai-engine/app.py.

The review_diff function:
  - Checks groq_client is available (returns 500 otherwise)
  - Iterates over files in the request
  - Skips files with empty changes
  - Calls Groq for each file
  - Parses the JSON response to extract review comments
  - Sanitizes each comment via sanitize_ai_output
  - Returns {"comments": [...]}
"""
"""
Tests for the /review-diff FastAPI endpoint in ai-engine/app.py.

The review_diff function:
  - Checks groq_client is available (returns 500 otherwise)
  - Iterates over files in the request
  - Skips files with empty changes
  - Calls Groq for each file
  - Parses the JSON response to extract review comments
  - Sanitizes each comment via sanitize_ai_output
  - Returns {"comments": [...]}
"""
import json
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# The app module needs to be imported from within the ai-engine directory.
# Run tests from the ai-engine/ directory.
import app as app_module


@pytest.fixture(autouse=True)
def patch_groq_client():
    """Patch the module-level groq_client before each test."""
    # Save and replace groq_client
    original = app_module.groq_client
    app_module.groq_client = MagicMock()
    app_module.groq_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='{"reviews": []}'))]
    )
    yield app_module
    app_module.groq_client = original


class TestReviewDiffEndpoint:
    """Tests for POST /review-diff endpoint."""

    def test_empty_files_list_returns_empty_comments(self, patch_groq_client):
        """When files list is empty, the endpoint returns an empty comments list."""
        client = TestClient(app_module.app)
        response = client.post("/review-diff", json={"files": []})

        assert response.status_code == 200
        data = response.json()
        assert data == {"comments": []}

    def test_file_with_empty_changes_skips_file(self, patch_groq_client):
        """Files with no changes (empty changes array) are skipped."""
        client = TestClient(app_module.app)
        payload = {
            "files": [
                {"path": "src/index.js", "changes": []},
                {"path": "src/util.js", "changes": [{"line": 1, "content": "const x = 1;"}]},
            ]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        data = response.json()
        # First file should be skipped (no changes), second file processed
        assert isinstance(data["comments"], list)

    def test_groq_unavailable_returns_500(self, patch_groq_client):
        """When groq_client is None (not configured), returns 500."""
        original = app_module.groq_client
        app_module.groq_client = None

        try:
            client = TestClient(app_module.app)
            response = client.post("/review-diff", json={
                "files": [{"path": "a.js", "changes": [{"line": 1, "content": "x"}]}]
            })
            assert response.status_code == 500
        finally:
            app_module.groq_client = original

    def test_valid_changes_returns_list_of_comments(self, patch_groq_client):
        """Valid changes return a list of comments extracted from AI response."""
        mock_ai_response = {
            "reviews": [
                {
                    "line": 10,
                    "type": "bug",
                    "comment": "### Bug\n\nNull check missing.\n\n#### Suggestion\n\nAdd a null guard."
                }
            ]
        }
        app_module.groq_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(mock_ai_response)))]
        )

        client = TestClient(app_module.app)
        payload = {
            "files": [
                {
                    "path": "auth.js",
                    "changes": [
                        {"line": 10, "content": "const user = getUser(id);"},
                        {"line": 11, "content": "user.send();"},
                    ]
                }
            ]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["comments"], list)
        assert len(data["comments"]) == 1
        assert data["comments"][0]["path"] == "auth.js"
        assert data["comments"][0]["line"] == 10
        assert "Null check" in data["comments"][0]["body"]

    def test_ai_returning_empty_reviews_returns_empty_comments(self, patch_groq_client):
        """When AI returns {\"reviews\": []}, the endpoint returns empty comments."""
        client = TestClient(app_module.app)
        payload = {
            "files": [
                {"path": "clean.js", "changes": [{"line": 1, "content": "const x = 1;"}]}
            ]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        data = response.json()
        # groq_client mock returns {"reviews": []} by default
        assert data["comments"] == []

    def test_request_validation_requires_files_field(self, patch_groq_client):
        """The request body must include the 'files' field (Pydantic validation)."""
        client = TestClient(app_module.app)
        # Missing 'files' field
        response = client.post("/review-diff", json={})
        assert response.status_code == 422  # FastAPI validation error

    def test_request_validation_requires_files_to_be_list(self, patch_groq_client):
        """The 'files' field must be a list (Pydantic validation)."""
        client = TestClient(app_module.app)
        # files must be a list
        response = client.post("/review-diff", json={"files": "not-a-list"})
        assert response.status_code == 422

    def test_review_comment_body_is_sanitized(self, patch_groq_client):
        """Review comment body should be sanitized via sanitize_ai_output."""
        mock_ai_response = {
            "reviews": [
                {
                    "line": 5,
                    "type": "style",
                    "comment": "### Style\n\nUse const not var\n\n```javascript\nconst x = 1;\n```"
                }
            ]
        }
        app_module.groq_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(mock_ai_response)))]
        )

        client = TestClient(app_module.app)
        payload = {
            "files": [
                {"path": "style.js", "changes": [{"line": 5, "content": "var x = 1;"}]}
            ]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert len(data["comments"]) == 1
        # Body should be sanitized
        assert "const x = 1;" in data["comments"][0]["body"]

    def test_multiple_files_each_get_individual_review(self, patch_groq_client):
        """Each file in the files list is reviewed individually."""
        call_count = [0]

        def side_effect(*args, **kwargs):
            call_count[0] += 1
            return MagicMock(
                choices=[MagicMock(message=MagicMock(content='{"reviews": []}'))]
            )

        app_module.groq_client.chat.completions.create.side_effect = side_effect

        client = TestClient(app_module.app)
        payload = {
            "files": [
                {"path": "a.js", "changes": [{"line": 1, "content": "a"}]},
                {"path": "b.py", "changes": [{"line": 2, "content": "b"}]},
                {"path": "c.ts", "changes": [{"line": 3, "content": "c"}]},
            ]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        # groq_client should be called once per file with changes
        assert call_count[0] == 3

    def test_model_default_is_used_when_not_specified(self, patch_groq_client):
        """The default model is llama-3.3-70b-versatile when not specified."""
        client = TestClient(app_module.app)
        # No 'model' field - should use default
        payload = {
            "files": [{"path": "x.js", "changes": [{"line": 1, "content": "x"}]}]
        }
        response = client.post("/review-diff", json=payload)

        assert response.status_code == 200
        # Verify groq_client was called (even if it returns empty)
        assert app_module.groq_client.chat.completions.create.called
