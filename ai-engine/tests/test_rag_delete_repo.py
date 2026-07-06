# Mock heavy dependencies before importing rag.
import sys
from unittest.mock import MagicMock, patch

import pytest
from rag import delete_repo_chunks, _MAX_INGEST_CHUNKS


class TestDeleteRepoChunks:

    def test_returns_zero_when_collection_is_empty(self):
        """When collection.get returns no ids, no deletions occur and 0 is returned."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/example/repo")

            assert result == 0
            mock_collection.delete.assert_not_called()

    def test_returns_total_count_of_all_deleted_chunks(self):
        """delete_repo_chunks sums the length of ids across all batches."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            # First batch: 3 ids, second batch: 2 ids, third batch: empty (end)
            mock_collection.get.side_effect = [
                {"ids": ["id-1", "id-2", "id-3"]},
                {"ids": ["id-4", "id-5"]},
                {"ids": []},
            ]
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/example/repo")

            assert result == 5

    def test_uses_max_ingest_chunks_batch_size(self):
        """Each collection.get call uses limit=_MAX_INGEST_CHUNKS."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            delete_repo_chunks("https://github.com/example/repo")

            mock_collection.get.assert_called_once_with(limit=_MAX_INGEST_CHUNKS)

    def test_calls_collection_delete_with_correct_ids_per_batch(self):
        """collection.delete is called with the ids from each batch."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.side_effect = [
                {"ids": ["id-a", "id-b"]},
                {"ids": ["id-c"]},
                {"ids": []},
            ]
            mock_get_col.return_value = mock_collection

            delete_repo_chunks("https://github.com/example/repo")

            assert mock_collection.delete.call_count == 2
            mock_collection.delete.assert_any_call(ids=["id-a", "id-b"])
            mock_collection.delete.assert_any_call(ids=["id-c"])

    def test_is_idempotent_on_already_empty_collection(self):
        """Calling delete_repo_chunks on an already-empty repo returns 0."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/example/empty-repo")

            assert result == 0
            mock_collection.delete.assert_not_called()

    def test_handles_single_batch_exactly_max_ingest_chunks(self):
        """When one batch has exactly _MAX_INGEST_CHUNKS ids, loop continues for next batch."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            # One full batch (500), then empty
            full_ids = [f"id-{i}" for i in range(_MAX_INGEST_CHUNKS)]
            mock_collection.get.side_effect = [
                {"ids": full_ids},
                {"ids": []},
            ]
            mock_get_col.return_value = mock_collection

            result = delete_repo_chunks("https://github.com/example/full-repo")

            assert result == _MAX_INGEST_CHUNKS
            assert mock_collection.delete.call_count == 1
