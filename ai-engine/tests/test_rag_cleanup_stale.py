# Tests for cleanup_stale_chunks in rag.py
import sys
from unittest.mock import MagicMock, patch

import pytest
from rag import cleanup_stale_chunks


class TestCleanupStaleChunks:
    def test_removes_files_not_in_current_files_set(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "a.py"},
                    {"source_file": "b.py"},
                    {"source_file": "c.py"},
                ]
            }
            mock_collection.count.return_value = 5
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            current = {"a.py", "b.py"}
            result = cleanup_stale_chunks(current, repo_url=None)

            assert "c.py" in result["stale_paths"]
            assert "a.py" not in result["stale_paths"]
            assert result["removed_count"] == 1
            assert result["remaining_count"] == 5
            mock_delete.assert_called_once_with("c.py", repo_url=None)

    def test_removes_multiple_stale_files(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "x.py"},
                    {"source_file": "y.py"},
                    {"source_file": "z.py"},
                ]
            }
            mock_collection.count.return_value = 3
            mock_get_col.return_value = mock_collection
            mock_delete.side_effect = [2, 3, 1]

            result = cleanup_stale_chunks(set(), repo_url=None)

            assert set(result["stale_paths"]) == {"x.py", "y.py", "z.py"}
            assert result["removed_count"] == 6  # 2 + 3 + 1
            assert mock_delete.call_count == 3

    def test_returns_empty_stale_when_all_files_current(self):
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

            current = {"a.py", "b.py"}
            result = cleanup_stale_chunks(current, repo_url=None)

            assert result["stale_paths"] == []
            assert result["removed_count"] == 0
            mock_delete.assert_not_called()

    def test_handles_empty_collection(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"metadatas": []}
            mock_collection.count.return_value = 0
            mock_get_col.return_value = mock_collection

            result = cleanup_stale_chunks({"a.py"}, repo_url=None)

            assert result["stale_paths"] == []
            assert result["removed_count"] == 0
            mock_delete.assert_not_called()

    def test_handles_metadata_with_missing_source_file(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "metadatas": [
                    {"source_file": "a.py"},
                    {},  # missing source_file
                    {"other": "field"},
                ]
            }
            mock_collection.count.return_value = 3
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            result = cleanup_stale_chunks(set(), repo_url=None)

            assert "a.py" in result["stale_paths"]
            assert len(result["stale_paths"]) == 1
            mock_delete.assert_called_once_with("a.py", repo_url=None)

    def test_passes_repo_url_to_delete_and_collection(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.delete_chunks_for_file') as mock_delete:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"metadatas": [{"source_file": "x.py"}]}
            mock_collection.count.return_value = 1
            mock_get_col.return_value = mock_collection
            mock_delete.return_value = 1

            result = cleanup_stale_chunks(set(), repo_url="https://github.com/owner/repo")

            mock_get_col.assert_called_once_with("https://github.com/owner/repo")
            mock_delete.assert_called_once_with("x.py", repo_url="https://github.com/owner/repo")
