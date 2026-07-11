from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import app

SERVICE_HEADERS = {"x-ai-engine-key": "test-ai-engine-key"}
client = TestClient(app, headers=SERVICE_HEADERS)


def _payload(files):
    return {"files": files, "model": "llama-3.3-70b-versatile"}


class TestAnalyzeConfigIntegration:
    def test_invalid_codereviewer_yml_halts_the_review_with_400(self):
        payload = _payload([
            {"name": "main.go", "content": "package main"},
            {"name": ".codereviewer.yml", "content": "rules:\n  no-console:\n    severity: nonsense\n"},
        ])
        with patch("app.groq_client", MagicMock()):
            response = client.post("/analyze", json=payload)
        assert response.status_code == 400
        assert "codereviewer" in response.json()["detail"].lower()

    def test_config_ignoring_every_file_returns_400(self):
        payload = _payload([
            {"name": "vendor/lib.go", "content": "package lib"},
            {"name": ".codereviewer.yml", "content": "ignore_paths:\n  - \"vendor/**\"\n"},
        ])
        with patch("app.groq_client", MagicMock()):
            response = client.post("/analyze", json=payload)
        assert response.status_code == 400
        assert "no files left" in response.json()["detail"].lower()

    def test_absent_config_file_does_not_change_behavior(self):
        """No .codereviewer.yml present at all -> falls through past config
        handling entirely (this test only verifies we don't 400 on config
        grounds; the eventual Groq call will fail since it's unmocked, which
        is fine, we're only asserting we got past the config-loading step)."""
        payload = _payload([{"name": "main.py", "content": "print('hi')"}])
        response = client.post("/analyze", json=payload)
        assert response.status_code != 400 or "codereviewer" not in response.json().get("detail", "").lower()

    def test_disabled_language_files_are_filtered_before_groq_is_called(self):
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = (
            '{"fileReviews": {}, "generatedReadme": "", "mermaidDiagram": "graph TD"}'
        )

        captured_prompts = []

        async def fake_call_groq(**kwargs):
            captured_prompts.append(kwargs["messages"][1]["content"])
            return mock_completion

        payload = _payload([
            {"name": "main.go", "content": "package main"},
            {"name": "main.py", "content": "print('hi')"},
            {"name": ".codereviewer.yml", "content": "languages:\n  go:\n    enabled: false\n"},
        ])

        with patch("app.groq_client", MagicMock()):
            with patch("app._call_groq_with_timeout", side_effect=fake_call_groq):
                response = client.post("/analyze", json=payload)

        assert response.status_code == 200
        # main.go should have been filtered out before reaching the prompt;
        # main.py (and the config file itself) should still be present.
        assert len(captured_prompts) >= 1
        assert "main.go" not in captured_prompts[0]
        assert "main.py" in captured_prompts[0]
