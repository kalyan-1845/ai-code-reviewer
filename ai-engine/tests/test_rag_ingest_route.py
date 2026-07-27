"""Tests for the /api/rag/ingest endpoint in app.py."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app, verify_rag_ingest_key


# Override auth dependency so tests work without real RAG ingest key
app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"

client = TestClient(app)


class TestRagIngestEndpoint:
    def test_returns_200_with_valid_request(self):
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 5
            response = client.post(
                "/api/rag/ingest",
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [
                        {
                            "chunk_id": "abc123",
                            "content": "def hello(): pass",
                            "metadata": {"fileName": "test.py"}
                        },
                        {
                            "chunk_id": "def456",
                            "content": "print('hello')",
                            "metadata": {"fileName": "main.py"}
                        }
                    ]
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["ingested_count"] == 5

    def test_returns_401_when_ingest_key_missing(self):
        # Set RAG_INGEST_KEY so the auth check runs
        original_key = os.environ.get("RAG_INGEST_KEY")
        os.environ["RAG_INGEST_KEY"] = "test-key"
        del app.dependency_overrides[verify_rag_ingest_key]
        try:
            response = client.post(
                "/api/rag/ingest",
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [
                        {"chunk_id": "abc", "content": "x", "metadata": {}}
                    ]
                }
            )
            assert response.status_code == 401
        finally:
            if original_key is None:
                os.environ.pop("RAG_INGEST_KEY", None)
            else:
                os.environ["RAG_INGEST_KEY"] = original_key
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"

    def test_returns_401_when_ingest_key_invalid(self):
        original_key = os.environ.get("RAG_INGEST_KEY")
        os.environ["RAG_INGEST_KEY"] = "test-key"
        del app.dependency_overrides[verify_rag_ingest_key]
        try:
            response = client.post(
                "/api/rag/ingest",
                headers={"x-rag-ingest-key": "wrong-key"},
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [
                        {"chunk_id": "abc", "content": "x", "metadata": {}}
                    ]
                }
            )
            assert response.status_code == 401
        finally:
            if original_key is None:
                os.environ.pop("RAG_INGEST_KEY", None)
            else:
                os.environ["RAG_INGEST_KEY"] = original_key
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"

    def test_returns_200_without_repo_url(self):
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            response = client.post(
                "/api/rag/ingest",
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [
                        {"chunk_id": "abc", "content": "x", "metadata": {}}
                    ]
                }
            )
            assert response.status_code == 200
            mock_upsert.assert_called_once()

    def test_extracts_correct_chunk_fields(self):
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            response = client.post(
                "/api/rag/ingest",
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [
                        {
                            "chunk_id": "id1",
                            "content": "content1",
                            "metadata": {"fileName": "a.py", "start_line": 1}
                        }
                    ]
                }
            )
            assert response.status_code == 200
            mock_upsert.assert_called_once()
            texts, metadatas, ids, repo_url = mock_upsert.call_args[0]
            assert texts == ["content1"]
            assert metadatas == [{"fileName": "a.py", "start_line": 1}]
            assert ids == ["id1"]
            assert repo_url == "https://github.com/owner/repo"
