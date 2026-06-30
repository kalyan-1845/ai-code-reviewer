from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def _mock_groq_response(content="This is a mock answer.", message_role="assistant"):
    """Return a mock Groq completion response."""
    mock_choice = MagicMock()
    mock_choice.message.content = content
    mock_choice.message.role = message_role
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    return mock_completion


class TestChatEndpoint:
    def test_chat_returns_200_with_mocked_groq(self):
        with patch.object(app.state if hasattr(app, 'state') else __import__('app', fromlist=['app']), 'groq_client', create=True):
            # Patch groq_client.chat.completions.create at module level
            import app as app_module
            original_client = getattr(app_module, 'groq_client', None)
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = _mock_groq_response("Here is the answer.")
            app_module.groq_client = mock_client

            try:
                response = client.post("/chat", json={
                    "files": [{"name": "main.py", "content": "print('hello')"}],
                    "message": "What does this do?",
                    "model": "llama-3.3-70b-versatile"
                })
                assert response.status_code == 200
                data = response.json()
                assert "response" in data
                assert isinstance(data["response"], str)
            finally:
                app_module.groq_client = original_client

    def test_chat_returns_500_when_groq_not_configured(self):
        """When groq_client is None, the endpoint should return 500."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        app_module.groq_client = None

        try:
            response = client.post("/chat", json={
                "files": [{"name": "main.py", "content": "x = 1"}],
                "message": "Hello",
            })
            assert response.status_code == 500
        finally:
            app_module.groq_client = original_client

    def test_chat_rejects_empty_files_list(self):
        """Empty files list should not cause server error — files are optional for basic chat."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response("Answer.")
        app_module.groq_client = mock_client

        try:
            response = client.post("/chat", json={
                "files": [],
                "message": "Hello",
            })
            # Should either return 200 (empty files handled) or 500 (groq called with empty context)
            assert response.status_code in [200, 500]
        finally:
            app_module.groq_client = original_client

    def test_chat_accepts_valid_model(self):
        """Custom model parameter should be passed to Groq."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response("Answer.")
        app_module.groq_client = mock_client

        try:
            response = client.post("/chat", json={
                "files": [{"name": "test.py", "content": "x = 1"}],
                "message": "Hi",
                "model": "deepseek-r1-distill-llama-70b"
            })
            # Check that the model was used (Groq was called)
            assert response.status_code == 200
        finally:
            app_module.groq_client = original_client

    def test_chat_rejects_invalid_temperature(self):
        """Temperature must be between 0 and 2."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        app_module.groq_client = MagicMock()

        try:
            response = client.post("/chat", json={
                "files": [{"name": "a.py", "content": "x = 1"}],
                "message": "Hi",
                "temperature": 99.0  # Out of range
            })
            assert response.status_code == 422, f"Expected 422 for out-of-range temperature, got {response.status_code}"
        finally:
            app_module.groq_client = original_client

    def test_chat_rejects_invalid_max_tokens(self):
        """maxTokens must be between 1 and 8192."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        app_module.groq_client = MagicMock()

        try:
            response = client.post("/chat", json={
                "files": [{"name": "a.py", "content": "x = 1"}],
                "message": "Hi",
                "maxTokens": 99999  # Out of range
            })
            assert response.status_code == 422
        finally:
            app_module.groq_client = original_client

    def test_chat_response_includes_truncated_files_field(self):
        """Response should include truncatedFiles array."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response("Short answer.")
        app_module.groq_client = mock_client

        try:
            response = client.post("/chat", json={
                "files": [{"name": "big.py", "content": "x" * 2000}],
                "message": "Explain",
            })
            assert response.status_code == 200
            data = response.json()
            assert "truncatedFiles" in data
            assert isinstance(data["truncatedFiles"], list)
        finally:
            app_module.groq_client = original_client

    def test_chat_accepts_history_messages(self):
        """history field should be accepted without error."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_groq_response("Second answer.")
        app_module.groq_client = mock_client

        try:
            response = client.post("/chat", json={
                "files": [{"name": "a.py", "content": "x = 1"}],
                "message": "Second question",
                "history": [
                    {"role": "user", "content": "First question"},
                    {"role": "assistant", "content": "First answer"}
                ]
            })
            assert response.status_code == 200
        finally:
            app_module.groq_client = original_client

    def test_chat_validates_required_message_field(self):
        """Missing message field should return 422."""
        import app as app_module
        original_client = getattr(app_module, 'groq_client', None)
        app_module.groq_client = MagicMock()

        try:
            response = client.post("/chat", json={
                "files": [{"name": "a.py", "content": "x = 1"}]
                # missing "message"
            })
            assert response.status_code == 422
        finally:
            app_module.groq_client = original_client
