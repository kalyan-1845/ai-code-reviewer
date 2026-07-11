# Mock heavy dependencies before importing rag
import sys
from unittest.mock import MagicMock, patch


import pytest
from rag import ingest_chunks


class TestIngestChunks:
    def test_returns_count_matching_input_chunks(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = ["def hello():", "print('hi')"]
            metadatas = [{"file_path": "a.py"}, {"file_path": "b.py"}]
            ids = ["id-1", "id-2"]

            result = ingest_chunks(chunks, metadatas, ids)

            assert result == 2
            mock_collection.add.assert_called_once()

    def test_calls_embed_texts_with_correct_chunks(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = ["chunk-a", "chunk-b", "chunk-c"]
            metadatas = [{"f": "1"}, {"f": "2"}, {"f": "3"}]
            ids = ["id-1", "id-2", "id-3"]
            result = ingest_chunks(
                chunks,
                metadatas,
                ids,
            )

            assert result == 3
            mock_embed.assert_called_once_with(chunks)

    def test_rejects_mismatched_input_lengths(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            chunks = ["chunk-a", "chunk-b", "chunk-c"]

            with pytest.raises(ValueError, match="same length"):
                ingest_chunks(
                    chunks,
                    [{"f": "1"}],
                    ["id-1"],
                )

            mock_embed.assert_not_called()
            mock_get_col.assert_not_called()

    def test_passes_correct_arguments_to_collection_add(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_emb = [[0.1] * 10]
            mock_embed.return_value = mock_emb
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = ["code content"]
            metadatas = [{"file_path": "test.py", "repo_url": "https://github.com/x/y"}]
            ids = ["unique-id"]

            ingest_chunks(chunks, metadatas, ids)

            call_kwargs = mock_collection.add.call_args[1]
            assert call_kwargs["embeddings"] == mock_emb
            assert call_kwargs["documents"] == chunks
            assert call_kwargs["metadatas"] == metadatas
            assert call_kwargs["ids"] == ids

    def test_handles_empty_chunks_list(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = []
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            result = ingest_chunks([], [], [])

            assert result == 0
            mock_embed.assert_not_called()
            mock_get_col.assert_not_called()

    def test_ingests_large_batch_correctly(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_emb = [[0.1] * 10] * 100
            mock_embed.return_value = mock_emb
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = [f"chunk-{i}" for i in range(100)]
            metadatas = [{"i": i} for i in range(100)]
            ids = [f"id-{i}" for i in range(100)]

            result = ingest_chunks(chunks, metadatas, ids)

            assert result == 100
            assert mock_collection.add.call_count == 1
