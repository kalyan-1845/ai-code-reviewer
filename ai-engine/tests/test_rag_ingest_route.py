"""Tests for the /api/rag/ingest endpoint in app.py."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app import app


INGEST_HEADERS = {"x-rag-ingest-key": "test-rag-ingest-key-123"}
client = TestClient(app)


class TestRagIngestEndpoint:
    def test_returns_200_with_valid_request(self):
        with patch("app.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 5
            response = client.post(
                "/api/rag/ingest",
                headers=INGEST_HEADERS,
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

    def test_returns_200_without_repo_url(self):
        with patch("app.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            response = client.post(
                "/api/rag/ingest",
                headers=INGEST_HEADERS,
                json={
                    "chunks": [
                        {"chunk_id": "abc", "content": "x", "metadata": {}}
                    ]
                }
            )
            assert response.status_code == 200
            mock_upsert.assert_called_once()
            call_kwargs = mock_upsert.call_args
            # repo_url defaults to None when not provided
            assert call_kwargs[1].get("repo_url") is None or (
                len(call_kwargs[0]) >= 4 and call_kwargs[0][3] is None
            )

    def test_extracts_correct_chunk_fields(self):
        with patch("app.upsert_chunks") as mock_upsert:
            mock_upsert.return_value = 1
            response = client.post(
                "/api/rag/ingest",
                headers=INGEST_HEADERS,
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
