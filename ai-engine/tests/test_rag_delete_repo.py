# Tests for delete_repo_chunks in rag.py
from unittest.mock import MagicMock, patch

import pytest
from rag import delete_repo_chunks


class TestDeleteRepoChunks:
    def test_returns_zero_when_collection_is_empty(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/owner/repo")

            assert result == 0
            mock_collection.delete.assert_not_called()

    def test_deletes_all_chunks_in_single_batch(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.side_effect = [{"ids": ["a", "b", "c"]}, {"ids": []}]
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/owner/repo")

            assert result == 3
            mock_collection.delete.assert_called_once_with(ids=["a", "b", "c"])

    def test_deletes_in_multiple_batches_for_many_ids(self):
        with patch("rag._get_collection") as mock_get_col, \
             patch("rag._MAX_INGEST_CHUNKS", 2):
            mock_collection = MagicMock()
            mock_collection.get.side_effect = [
                {"ids": ["id-1", "id-2"]},
                {"ids": ["id-3"]},
                {"ids": []},
            ]
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/owner/repo")

            assert result == 3
            assert mock_collection.delete.call_count == 2
            mock_collection.delete.assert_any_call(ids=["id-1", "id-2"])
            mock_collection.delete.assert_any_call(ids=["id-3"])

    def test_passes_repo_url_to_get_collection(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            delete_repo_chunks("https://github.com/org/project")

            mock_get_col.assert_called_once_with("https://github.com/org/project")

    def test_is_idempotent_on_already_empty_collection(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.side_effect = [{"ids": []}, {"ids": []}]
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/owner/repo")
            assert result == 0

            result2 = delete_repo_chunks("https://github.com/owner/repo")
            assert result2 == 0

            assert mock_collection.get.call_count == 2
            mock_collection.delete.assert_not_called()
