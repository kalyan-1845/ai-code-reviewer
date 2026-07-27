"""Tests for the /api/rag/ingest endpoint in app.py."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app, verify_rag_ingest_key


def _make_overridden_client():
    """Create a TestClient with auth dependency overridden."""
    overridden = TestClient(app)
    overridden.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"
    return overridden


class TestRagIngestEndpoint:
    def test_returns_200_with_valid_request(self):
        """Successful ingestion when all required fields are present."""
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 5
            client = _make_overridden_client()
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
        """Endpoint returns 401 when no auth key is provided."""
        with patch("rag.upsert_chunks"):
            client = TestClient(app)  # no override - real auth check
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

    def test_returns_401_when_ingest_key_invalid(self):
        """Endpoint returns 401 when an invalid auth key is provided."""
        with patch("rag.upsert_chunks"):
            client = TestClient(app)  # no override - real auth check
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

    def test_returns_422_when_repo_url_missing(self):
        """Endpoint returns 422 when repo_url is not provided (required field)."""
        with patch("rag.upsert_chunks"):
            client = _make_overridden_client()
            response = client.post(
                "/api/rag/ingest",
                json={
                    "chunks": [
                        {"chunk_id": "abc", "content": "x", "metadata": {}}
                    ]
                }
            )
            assert response.status_code == 422

    def test_returns_422_when_chunks_missing(self):
        """Endpoint returns 422 when chunks field is not provided (required field)."""
        with patch("rag.upsert_chunks"):
            client = _make_overridden_client()
            response = client.post(
                "/api/rag/ingest",
                json={"repo_url": "https://github.com/owner/repo"}
            )
            assert response.status_code == 422

    def test_extracts_correct_chunk_fields(self):
        """Endpoint correctly extracts content, metadata, chunk_id, and repo_url from request."""
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            client = _make_overridden_client()
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
            call_args = mock_upsert.call_args
            # upsert_chunks(texts, metadatas, ids, repo_url=repo_url)
            texts, metadatas, ids = call_args[0]
            assert texts == ["content1"]
            assert metadatas == [{"fileName": "a.py", "start_line": 1}]
            assert ids == ["id1"]
            assert call_args[1]["repo_url"] == "https://github.com/owner/repo"
