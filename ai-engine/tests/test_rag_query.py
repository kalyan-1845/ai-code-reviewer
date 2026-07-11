# Mock heavy dependencies before importing rag
import sys
from unittest.mock import MagicMock, patch


import pytest
# Patch embed_texts before importing rag
with patch('rag.embed_texts') as mock_embed_texts, \
     patch('rag._get_collection') as mock_get_collection:
    mock_embed_texts.return_value = [[0.1] * 10]
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "ids": [["chunk-1"]],
        "documents": [["def hello():\n    print('hi')"]],
        "metadatas": [[{"file_path": "test.py", "repo_url": "https://github.com/owner/repo"}]],
        "distances": [[0.15]],
    }
    mock_get_collection.return_value = mock_collection

    from rag import query_chunks


class TestQueryChunks:
    def test_returns_single_chunk_with_correct_fields(self):
        with patch('rag.embed_texts') as mock_embed_texts, \
             patch('rag._get_collection') as mock_get_collection:
            mock_embed_texts.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_collection.count.return_value = 10
            mock_collection.query.return_value = {
                "ids": [["chunk-1"]],
                "documents": [["def hello():\n    print('hi')"]],
                "metadatas": [[{"file_path": "test.py"}]],
                "distances": [[0.1]],
            }
            mock_get_collection.return_value = mock_collection

            result = query_chunks("how to say hello", n_results=5)
            assert len(result) == 1
            assert result[0]["chunk_id"] == "chunk-1"
            assert result[0]["content"] == "def hello():\n    print('hi')"
            assert result[0]["metadata"] == {"file_path": "test.py"}
            assert 0 <= result[0]["similarity_score"] <= 1

    def test_computes_similarity_score_from_distance(self):
        with patch('rag.embed_texts') as mock_embed_texts, \
             patch('rag._get_collection') as mock_get_collection:
            mock_embed_texts.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_collection.count.return_value = 10
            # ChromaDB returns distances as [[d1, d2, ...]] (one inner list per query)
            # For cosine distance: 0.0 means identical (score=1.0), 1.0 means opposite (score=0.0)
            mock_collection.query.return_value = {
                "ids": [["a", "b"]],
                "documents": [["content-a", "content-b"]],
                "metadatas": [[{}, {}]],
                "distances": [[0.0, 1.0]],
            }
            mock_get_collection.return_value = mock_collection

            result = query_chunks("test query", n_results=5)
            assert result[0]["similarity_score"] == 1.0
            assert result[1]["similarity_score"] == 0.0

    def test_handles_empty_results(self):
        with patch('rag.embed_texts') as mock_embed_texts, \
             patch('rag._get_collection') as mock_get_collection:
            mock_embed_texts.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_collection.count.return_value = 10
            mock_collection.query.return_value = {}
            mock_get_collection.return_value = mock_collection

            result = query_chunks("nonexistent concept", n_results=5)
            assert result == []

    def test_handles_missing_metadata_fields(self):
        with patch('rag.embed_texts') as mock_embed_texts, \
             patch('rag._get_collection') as mock_get_collection:
            mock_embed_texts.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_collection.count.return_value = 10
            # metadata list shorter than documents list
            mock_collection.query.return_value = {
                "ids": [["chunk-1", "chunk-2"]],
                "documents": [["content-1", "content-2"]],
                "metadatas": [[{"source": "file.py"}]],
                "distances": [[0.1, 0.2]],
            }
            mock_get_collection.return_value = mock_collection

            result = query_chunks("test", n_results=5)
            assert len(result) == 2
            assert result[0]["metadata"] == {"source": "file.py"}
            # chunk-2 has no metadata entry, should get empty dict
            assert result[1]["metadata"] == {}

    def test_passes_n_results_to_collection(self):
        with patch('rag.embed_texts') as mock_embed_texts, \
             patch('rag._get_collection') as mock_get_collection:
            mock_embed_texts.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_collection.count.return_value = 10
            mock_collection.query.return_value = {
                "ids": [["c1"], ["c2"], ["c3"]],
                "documents": [["doc1"], ["doc2"], ["doc3"]],
                "metadatas": [[{}], [{}], [{}]],
                "distances": [[0.1, 0.2, 0.3]],
            }
            mock_get_collection.return_value = mock_collection

            query_chunks("test", n_results=3)
            mock_collection.query.assert_called_once()
            call_kwargs = mock_collection.query.call_args[1]
            assert call_kwargs["n_results"] == 3
