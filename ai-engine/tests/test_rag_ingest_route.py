"""Tests for the /api/rag/ingest endpoint in app.py."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app, verify_rag_ingest_key


def _make_client():
    """Create a fresh TestClient with auth dependency overridden."""
    from fastapi.testclient import TestClient as TC
    return TC(app)


class TestRagIngestEndpoint:
    def test_returns_200_with_valid_request(self):
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 5
            c = _make_client()
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"
            try:
                response = c.post(
                    "/api/rag/ingest",
                    json={
                        "repo_url": "https://github.com/owner/repo",
                        "chunks": [
                            {"chunk_id": "abc123", "content": "def hello(): pass",
                             "metadata": {"fileName": "test.py"}},
                            {"chunk_id": "def456", "content": "print('hello')",
                             "metadata": {"fileName": "main.py"}}
                        ]
                    }
                )
                assert response.status_code == 200
                data = response.json()
                assert data["ingested_count"] == 5
            finally:
                del app.dependency_overrides[verify_rag_ingest_key]

    def test_returns_401_when_ingest_key_missing(self):
        """Without override the endpoint should return 401."""
        with patch("rag.upsert_chunks"):
            c = _make_client()
            response = c.post(
                "/api/rag/ingest",
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [{"chunk_id": "abc", "content": "x", "metadata": {}}]
                }
            )
            assert response.status_code == 401

    def test_returns_401_when_ingest_key_invalid(self):
        with patch("rag.upsert_chunks"):
            c = _make_client()
            response = c.post(
                "/api/rag/ingest",
                headers={"x-rag-ingest-key": "wrong-key"},
                json={
                    "repo_url": "https://github.com/owner/repo",
                    "chunks": [{"chunk_id": "abc", "content": "x", "metadata": {}}]
                }
            )
            assert response.status_code == 401

    def test_returns_422_when_repo_url_missing(self):
        """repo_url is a required field - missing it should return 422."""
        with patch("rag.upsert_chunks"):
            c = _make_client()
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"
            try:
                response = c.post(
                    "/api/rag/ingest",
                    json={"chunks": [{"chunk_id": "abc", "content": "x", "metadata": {}}]}
                )
                assert response.status_code == 422
            finally:
                del app.dependency_overrides[verify_rag_ingest_key]

    def test_returns_422_when_chunks_missing(self):
        with patch("rag.upsert_chunks"):
            c = _make_client()
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"
            try:
                response = c.post(
                    "/api/rag/ingest",
                    json={"repo_url": "https://github.com/owner/repo"}
                )
                assert response.status_code == 422
            finally:
                del app.dependency_overrides[verify_rag_ingest_key]

    def test_extracts_correct_chunk_fields(self):
        with patch("rag.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            c = _make_client()
            app.dependency_overrides[verify_rag_ingest_key] = lambda: "test-user"
            try:
                response = c.post(
                    "/api/rag/ingest",
                    json={
                        "repo_url": "https://github.com/owner/repo",
                        "chunks": [{"chunk_id": "id1", "content": "content1",
                                    "metadata": {"fileName": "a.py", "start_line": 1}}]
                    }
                )
                assert response.status_code == 200
                mock_upsert.assert_called_once()
                call_args = mock_upsert.call_args
                texts, metadatas, ids = call_args[0]
                assert texts == ["content1"]
                assert metadatas == [{"fileName": "a.py", "start_line": 1}]
                assert ids == ["id1"]
                assert call_args[1]["repo_url"] == "https://github.com/owner/repo"
            finally:
                del app.dependency_overrides[verify_rag_ingest_key]
