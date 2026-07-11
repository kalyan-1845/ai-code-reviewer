# Tests for delete_chunks_for_file in rag.py
from unittest.mock import MagicMock, patch

import pytest
from rag import delete_chunks_for_file


class TestDeleteChunksForFile:
    def test_returns_count_of_deleted_chunks(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "ids": ["id-1", "id-2", "id-3"]
            }
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("a.py", repo_url=None)

            assert result == 3
            mock_collection.delete.assert_called_once_with(ids=["id-1", "id-2", "id-3"])

    def test_calls_collection_get_with_where_filter(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": ["id-1"]}
            mock_get_col.return_value = mock_collection

            delete_chunks_for_file("src/main.py", repo_url=None)

            mock_collection.get.assert_called_once_with(where={"source_file": "src/main.py"})

    def test_returns_zero_when_no_chunks_found(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("nonexistent.py", repo_url=None)

            assert result == 0
            mock_collection.delete.assert_not_called()

    def test_does_not_call_delete_when_ids_list_is_empty(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            delete_chunks_for_file("empty.py", repo_url=None)

            mock_collection.delete.assert_not_called()

    def test_passes_repo_url_to_collection(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": ["id-1"]}
            mock_get_col.return_value = mock_collection

            delete_chunks_for_file("a.py", repo_url="https://github.com/owner/repo")

            mock_get_col.assert_called_once_with("https://github.com/owner/repo")

    def test_handles_missing_ids_key_in_get_result(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {}  # no ids key
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("a.py", repo_url=None)

            assert result == 0
            mock_collection.delete.assert_not_called()
