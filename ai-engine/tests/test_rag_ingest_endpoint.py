import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


class TestRagIngestEndpoint:
    @patch('rag.ingest_chunks')
    @patch('rag.delete_repo_chunks')
    def test_returns_ingested_count_from_rag_module(self, mock_delete, mock_ingest):
        mock_ingest.return_value = 5
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

    @patch('rag.ingest_chunks')
    @patch('rag.delete_repo_chunks')
    def test_calls_delete_repo_chunks_before_ingest(self, mock_delete, mock_ingest):
        mock_ingest.return_value = 3
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
        mock_delete.assert_called_once_with("https://github.com/acme/project")

    @patch('rag.delete_repo_chunks')
    @patch('rag.ingest_chunks')
    def test_returns_correct_ingested_count_for_large_batch(self, mock_delete, mock_ingest):
        mock_ingest.return_value = 1
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
        mock_ingest.assert_called_once()
        data = response.json()
        assert data["ingested_count"] == 1

    @patch('rag.ingest_chunks')
    @patch('rag.delete_repo_chunks')
    def test_returns_422_when_repo_url_missing(self, mock_delete, mock_ingest):
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

    @patch('rag.ingest_chunks')
    @patch('rag.delete_repo_chunks')
    def test_returns_422_when_chunks_missing(self, mock_delete, mock_ingest):
        payload = {
            "repo_url": "https://github.com/test/repo",
        }
        response = client.post("/api/rag/ingest", json=payload)
        assert response.status_code == 422
