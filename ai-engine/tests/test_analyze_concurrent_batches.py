"""
Verifies the /analyze endpoint's concurrent batch processing (#1675):
Groq calls for each batch now fan out via asyncio.gather instead of running
one-at-a-time, but the final merged result must be identical in shape to the
old sequential behavior — all fileReviews merged, mermaidDiagram/
generatedReadme sourced only from the first batch, and a failing non-first
batch skipped without aborting the whole request.
"""
import json
from unittest.mock import MagicMock

import pytest
import app as app_module
from fastapi.testclient import TestClient

SERVICE_HEADERS = {"x-ai-engine-key": "test-ai-engine-key"}
client = TestClient(app_module.app, headers=SERVICE_HEADERS)


def _extract_batch_filenames(messages):
    """Pull the '--- File: <name> ---' markers out of the user prompt so the
    fake Groq call can tailor its response to whichever batch it was asked
    to review."""
    user_content = messages[1]["content"]
    names = []
    for line in user_content.splitlines():
        if line.startswith("--- File: ") and line.endswith(" ---"):
            names.append(line[len("--- File: "):-len(" ---")])
    return names


def _make_fake_completion(content: str):
    completion = MagicMock()
    completion.choices = [MagicMock(message=MagicMock(content=content))]
    return completion


@pytest.fixture
def fake_groq(monkeypatch):
    monkeypatch.setattr(app_module, "groq_client", MagicMock())

    call_log = []

    async def fake_call_groq_with_timeout(**kwargs):
        messages = kwargs["messages"]
        is_first_batch = "MUST construct a valid Mermaid.js flowchart" in messages[1]["content"]
        filenames = _extract_batch_filenames(messages)
        call_log.append(filenames)

        file_reviews = {
            name: {
                "bugs": [{"type": "test-bug", "line": 1, "description": f"issue in {name}", "suggestion": "fix it"}],
                "security": [],
                "optimization": [],
                "styling": [],
            }
            for name in filenames
        }

        payload = {"fileReviews": file_reviews}
        if is_first_batch:
            payload["generatedReadme"] = "# Fake Readme"
            payload["mermaidDiagram"] = "graph TD\n  A[\"Start\"] --> B[\"End\"]"

        return _make_fake_completion(json.dumps(payload))

    monkeypatch.setattr(app_module, "_call_groq_with_timeout", fake_call_groq_with_timeout)
    return call_log


def test_analyze_merges_fileReviews_from_all_batches(fake_groq):
    payload = {
        "files": [
            {"name": "a.py", "content": "print(1)"},
            {"name": "b.py", "content": "print(2)"},
            {"name": "c.py", "content": "print(3)"},
        ],
        "batchSize": 1,
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert set(data["fileReviews"].keys()) == {"a.py", "b.py", "c.py"}
    for name in ("a.py", "b.py", "c.py"):
        assert data["fileReviews"][name]["bugs"][0]["description"] == f"issue in {name}"

    # 3 files at batchSize=1 means 3 separate concurrent Groq calls were made.
    assert len(fake_groq) == 3


def test_analyze_readme_and_mermaid_come_only_from_first_batch(fake_groq):
    payload = {
        "files": [
            {"name": "a.py", "content": "print(1)"},
            {"name": "b.py", "content": "print(2)"},
        ],
        "batchSize": 1,
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["generatedReadme"] == "# Fake Readme"
    assert "graph TD" in data["mermaidDiagram"]


def test_analyze_single_batch_still_works(fake_groq):
    payload = {
        "files": [
            {"name": "only.py", "content": "print('solo')"},
        ],
        "batchSize": 5,
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "only.py" in data["fileReviews"]
    assert data["generatedReadme"] == "# Fake Readme"
    assert len(fake_groq) == 1


def test_analyze_first_batch_failure_aborts_whole_request(monkeypatch):
    monkeypatch.setattr(app_module, "groq_client", MagicMock())

    async def failing_call(**kwargs):
        raise RuntimeError("groq is down")

    monkeypatch.setattr(app_module, "_call_groq_with_timeout", failing_call)

    payload = {
        "files": [{"name": "a.py", "content": "print(1)"}],
        "batchSize": 1,
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 500
    assert "first batch" in response.json()["detail"]


def test_analyze_non_first_batch_failure_is_skipped_not_fatal(monkeypatch):
    monkeypatch.setattr(app_module, "groq_client", MagicMock())

    async def flaky_call(**kwargs):
        messages = kwargs["messages"]
        filenames = _extract_batch_filenames(messages)
        if filenames == ["b.py"]:
            raise RuntimeError("transient failure on batch 2")
        payload = {
            "fileReviews": {name: {"bugs": [], "security": [], "optimization": [], "styling": []} for name in filenames},
            "generatedReadme": "# Fake Readme",
            "mermaidDiagram": "graph TD\n  A[\"S\"] --> B[\"E\"]",
        }
        return _make_fake_completion(json.dumps(payload))

    monkeypatch.setattr(app_module, "_call_groq_with_timeout", flaky_call)

    payload = {
        "files": [
            {"name": "a.py", "content": "print(1)"},
            {"name": "b.py", "content": "print(2)"},
        ],
        "batchSize": 1,
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    # a.py (batch 0) succeeded and is present; b.py (batch 1) failed and was
    # skipped, but the request as a whole still returns 200 with partial results.
    assert "a.py" in data["fileReviews"]
    assert "b.py" not in data["fileReviews"]
