# Mock heavy dependencies before importing rag so no real ChromaDB or
# sentence-transformers model is needed during the test run.
import sys
from unittest.mock import MagicMock, patch


import pytest
from rag import delete_chunks_for_file, cleanup_stale_chunks, delete_collection


class TestDeleteChunksForFile:
    def test_returns_count_of_deleted_chunks(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": ["id-1", "id-2", "id-3"]}
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("src/main.py")

            assert result == 3

    def test_calls_collection_delete_with_correct_ids(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": ["chunk-a", "chunk-b"]}
            mock_get_col.return_value = mock_collection

            delete_chunks_for_file("src/utils.py")

            mock_collection.delete.assert_called_once_with(ids=["chunk-a", "chunk-b"])

    def test_queries_collection_with_correct_where_filter(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            delete_chunks_for_file("src/app.py")

            mock_collection.get.assert_called_once_with(
                where={"source_file": "src/app.py"}
            )

    def test_does_not_call_delete_when_no_chunks_found(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("nonexistent.py")

            mock_collection.delete.assert_not_called()
            assert result == 0

    def test_returns_zero_when_ids_key_missing_from_result(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {}
            mock_get_col.return_value = mock_collection

            result = delete_chunks_for_file("missing.py")

            assert result == 0
            mock_collection.delete.assert_not_called()


class TestCleanupStaleChunks:
    def test_removes_chunks_for_files_not_in_current_set(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "keep.py"},
                    {"source_file": "stale.py"},
                    {"source_file": "also_stale.py"},
                ]
            }
            mock_collection.count.return_value = 1
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            result = cleanup_stale_chunks({"keep.py"})

            assert result["removed_count"] == 2
            assert set(result["stale_paths"]) == {"stale.py", "also_stale.py"}
            assert result["remaining_count"] == 1

    def test_does_not_remove_chunks_when_all_files_are_current(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "a.py"},
                    {"source_file": "b.py"},
                ]
            }
            mock_collection.count.return_value = 2
            mock_get_col.return_value = mock_collection

            result = cleanup_stale_chunks({"a.py", "b.py"})

            mock_delete.assert_not_called()
            assert result["removed_count"] == 0
            assert result["stale_paths"] == []

    def test_removes_all_chunks_when_current_files_is_empty(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "x.py"},
                    {"source_file": "y.py"},
                ]
            }
            mock_collection.count.return_value = 0
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            result = cleanup_stale_chunks(set())

            assert result["removed_count"] == 2
            assert set(result["stale_paths"]) == {"x.py", "y.py"}

    def test_skips_chunks_with_missing_source_file_metadata(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            # One chunk has no source_file key — should be silently ignored
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "valid.py"},
                    {"other_key": "no_source"},
                ]
            }
            mock_collection.count.return_value = 1
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            result = cleanup_stale_chunks(set())

            # Only "valid.py" should be treated as stale; the entry without
            # source_file is silently skipped
            assert set(result["stale_paths"]) == {"valid.py"}

    def test_returns_correct_response_shape(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file'):
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"metadatas": []}
            mock_collection.count.return_value = 0
            mock_get_col.return_value = mock_collection

            result = cleanup_stale_chunks(set())

            assert "stale_paths" in result
            assert "removed_count" in result
            assert "remaining_count" in result


class TestDeleteCollection:
    def test_returns_true_when_collection_exists_and_is_deleted(self):
        with patch('rag._get_client') as mock_get_client, \
             patch('rag._collection_name') as mock_col_name:
            mock_client = MagicMock()
            mock_get_client.return_value = mock_client
            mock_col_name.return_value = "test_collection"

            result = delete_collection("https://github.com/test/repo")

            mock_client.delete_collection.assert_called_once_with("test_collection")
            assert result is True

    def test_returns_false_when_collection_does_not_exist(self):
        with patch('rag._get_client') as mock_get_client, \
             patch('rag._collection_name') as mock_col_name:
            mock_client = MagicMock()
            mock_client.delete_collection.side_effect = ValueError("Collection not found")
            mock_get_client.return_value = mock_client
            mock_col_name.return_value = "nonexistent_collection"

            result = delete_collection("https://github.com/test/nonexistent")

            assert result is False

    def test_handles_non_string_repo_url_gracefully(self):
        with patch('rag._get_client') as mock_get_client, \
             patch('rag._collection_name') as mock_col_name:
            mock_client = MagicMock()
            mock_get_client.return_value = mock_client
            # Pass a non-string value; _collection_name should handle it
            mock_col_name.return_value = "collection_from_none"

            # Should not raise — function returns bool
            result = delete_collection(None)
            assert isinstance(result, bool)

    def test_delete_collection_receives_correct_collection_name(self):
        with patch('rag._get_client') as mock_get_client, \
             patch('rag._collection_name') as mock_col_name:
            mock_client = MagicMock()
            mock_get_client.return_value = mock_client
            mock_col_name.return_value = "custom_collection_name"

            delete_collection("https://github.com/org/project")

            mock_col_name.assert_called_once_with("https://github.com/org/project")
            mock_client.delete_collection.assert_called_once_with("custom_collection_name")
