import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


class TestRagChunksEndpoint:
    @patch('rag.get_collection_stats')
    @patch('rag.get_chunks_paginated')
    def test_returns_200_with_chunks_and_total_count(self, mock_get_chunks, mock_stats):
        mock_get_chunks.return_value = [
            {"chunk_id": "file1-py-0", "content": "def foo(): pass", "metadata": {"source_file": "file1.py"}, "similarity_score": 0.95},
        ]
        mock_stats.return_value = {"chunk_count": 1}
        payload = {"limit": 10, "offset": 0, "repo_url": "https://github.com/test/repo"}
        response = client.post("/api/rag/chunks", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "chunks" in data
        assert "total_chunks" in data
        assert len(data["chunks"]) == 1
        assert data["total_chunks"] == 1

    @patch('rag.get_collection_stats')
    @patch('rag.get_chunks_paginated')
    def test_passes_correct_limit_and_offset_to_get_chunks_paginated(self, mock_get_chunks, mock_stats):
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 0}
        payload = {"limit": 5, "offset": 20, "repo_url": "https://github.com/org/repo"}
        response = client.post("/api/rag/chunks", json=payload)
        assert response.status_code == 200
        mock_get_chunks.assert_called_once()
        call_kwargs = mock_get_chunks.call_args
        assert call_kwargs.kwargs.get("limit") == 5
        assert call_kwargs.kwargs.get("offset") == 20
        assert call_kwargs.kwargs.get("repo_url") == "https://github.com/org/repo"

    @patch('rag.get_collection_stats')
    @patch('rag.get_chunks_paginated')
    def test_uses_default_limit_and_offset_when_not_provided(self, mock_get_chunks, mock_stats):
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 0}
        payload = {}
        response = client.post("/api/rag/chunks", json=payload)
        assert response.status_code == 200
        mock_get_chunks.assert_called_once()
        call_kwargs = mock_get_chunks.call_args
        # Default limit=50, offset=0
        assert call_kwargs.kwargs.get("limit") == 50
        assert call_kwargs.kwargs.get("offset") == 0

    @patch('rag.get_collection_stats')
    @patch('rag.get_chunks_paginated')
    def test_returns_total_chunks_from_get_collection_stats(self, mock_get_chunks, mock_stats):
        mock_get_chunks.return_value = [{"chunk_id": "x", "content": "x", "metadata": {}, "similarity_score": 0.9}]
        mock_stats.return_value = {"chunk_count": 42}
        payload = {"repo_url": "https://github.com/acme/project"}
        response = client.post("/api/rag/chunks", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["total_chunks"] == 42

    @patch('rag.get_collection_stats')
    @patch('rag.get_chunks_paginated')
    def test_returns_empty_chunks_list_when_no_results(self, mock_get_chunks, mock_stats):
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 0}
        payload = {"repo_url": "https://github.com/empty/repo"}
        response = client.post("/api/rag/chunks", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["chunks"] == []
        assert data["total_chunks"] == 0
