# Tests for upsert_chunks in rag.py
import sys
from unittest.mock import MagicMock, patch

import pytest
from rag import upsert_chunks


class TestUpsertChunks:
    def test_returns_zero_for_empty_chunks_list(self):
        result = upsert_chunks([], [], [], repo_url=None)
        assert result == 0

    def test_upserts_chunks_with_correct_arguments(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = [[0.1] * 10, [0.2] * 10]
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = ["chunk-a", "chunk-b"]
            metadatas = [{"f": "1"}, {"f": "2"}]
            ids = ["id-1", "id-2"]

            result = upsert_chunks(chunks, metadatas, ids, repo_url=None)

            assert result == 2
            mock_collection.upsert.assert_called_once()
            call_kwargs = mock_collection.upsert.call_args.kwargs
            assert call_kwargs["documents"] == chunks
            assert call_kwargs["metadatas"] == metadatas
            assert call_kwargs["ids"] == ids
            assert call_kwargs["embeddings"] == [[0.1] * 10, [0.2] * 10]

    def test_calls_embed_texts_with_chunks(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            chunks = ["single-chunk"]
            result = upsert_chunks(chunks, [{"f": "1"}], ["id-1"])

            mock_embed.assert_called_once_with(chunks)

    def test_raises_valueerror_for_mismatched_lengths(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_get_col.return_value = MagicMock()

            with pytest.raises(ValueError, match="same length"):
                upsert_chunks(
                    ["a", "b"],
                    [{"f": "1"}],  # only 1 metadata
                    ["id-1", "id-2"],
                )

    def test_raises_valueerror_when_only_chunks_and_ids_match(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_get_col.return_value = MagicMock()

            with pytest.raises(ValueError, match="same length"):
                upsert_chunks(
                    ["a", "b"],
                    [{"f": "1"}, {"f": "2"}],
                    ["id-1"],  # only 1 id
                )

    def test_passes_repo_url_to_collection(self):
        with patch('rag.embed_texts') as mock_embed, \
             patch('rag._get_collection') as mock_get_col:
            mock_embed.return_value = [[0.1] * 10]
            mock_collection = MagicMock()
            mock_get_col.return_value = mock_collection

            upsert_chunks(
                ["chunk-a"],
                [{"f": "1"}],
                ["id-1"],
                repo_url="https://github.com/owner/repo",
            )

            mock_get_col.assert_called_once_with("https://github.com/owner/repo")
