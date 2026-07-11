import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


class TestRagIngestEndpoint:
    @patch('rag.upsert_chunks')
    def test_returns_ingested_count_from_rag_module(self, mock_upsert):
        mock_upsert.return_value = 5
        payload = {
            "repo_url": "https://github.com/test/repo",
            "chunks": [
                {
                    "chunk_id": "file1-py-0",
                    "content": "def foo(): pass",
                    "metadata": {"source_file": "file1.py", "fileName": "file1.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
                {
                    "chunk_id": "file2-py-0",
                    "content": "def bar(): pass",
                    "metadata": {"source_file": "file2.py", "fileName": "file2.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
            ],
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["ingested_count"] == 5

    @patch('rag.upsert_chunks')
    def test_calls_upsert_chunks_for_ingest(self, mock_upsert):
        mock_upsert.return_value = 1
        payload = {
            "repo_url": "https://github.com/acme/project",
            "chunks": [
                {
                    "chunk_id": "file-py-0",
                    "content": "print('hello')",
                    "metadata": {"source_file": "file.py", "fileName": "file.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
            ],
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 200
        mock_upsert.assert_called_once()

    @patch('rag.upsert_chunks')
    def test_returns_correct_ingested_count_for_large_batch(self, mock_upsert):
        mock_upsert.return_value = 1
        payload = {
            "repo_url": "https://github.com/org/repo",
            "chunks": [
                {
                    "chunk_id": "src-main-py-0",
                    "content": "x = 1",
                    "metadata": {"source_file": "src/main.py", "fileName": "src/main.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
            ],
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 200
        mock_upsert.assert_called_once()
        data = response.json()
        assert data["ingested_count"] == 1

    @patch('rag.upsert_chunks')
    def test_returns_422_when_repo_url_missing(self, mock_upsert):
        payload = {
            "chunks": [
                {
                    "chunk_id": "file-py-0",
                    "content": "x = 1",
                    "metadata": {"source_file": "file.py", "fileName": "file.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
            ],
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 422

    @patch('rag.upsert_chunks')
    def test_returns_422_when_chunks_missing(self, mock_upsert):
        payload = {
            "repo_url": "https://github.com/test/repo",
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 422

    @patch('rag.upsert_chunks')
    def test_requires_rag_ingest_key_when_configured(self, mock_upsert, monkeypatch):
        monkeypatch.setenv("RAG_INGEST_KEY", "ingest-secret")
        mock_upsert.return_value = 1
        payload = {
            "repo_url": "https://github.com/test/repo",
            "chunks": [
                {
                    "chunk_id": "file-py-0",
                    "content": "x = 1",
                    "metadata": {"source_file": "file.py", "fileName": "file.py", "chunk_index": 0, "total_chunks": 1, "language": "python", "start_line": 1, "end_line": 1},
                },
            ],
        }

        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 401

        response = client.post(
            "/api/rag/ingest",
            json=payload,
            headers={"x-rag-ingest-key": "ingest-secret"},
        )
        assert response.status_code == 200
