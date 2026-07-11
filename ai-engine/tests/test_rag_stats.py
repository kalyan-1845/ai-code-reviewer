import pytest
from unittest.mock import MagicMock, patch


# Patch rag dependencies before importing
with patch('rag.embed_texts') as mock_embed, \
     patch('rag._get_collection') as mock_get_col:
    mock_embed.return_value = [[0.1] * 10]
    mock_collection = MagicMock()
    mock_get_col.return_value = mock_collection

    from rag import get_collection_stats, delete_chunks_for_file, cleanup_stale_chunks


class TestGetCollectionStats:
    def test_returns_correct_structure(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.get_embedding_dimension') as mock_dim:
            mock_col = MagicMock()
            mock_col.count.return_value = 42
            mock_get_col.return_value = mock_col
            mock_dim.return_value = 384

            result = get_collection_stats()

            assert 'collection' in result
            assert result['chunk_count'] == 42
            assert result['embedding_dimension'] == 384

    def test_calls_collection_count(self):
        with patch('rag._get_collection') as mock_get_col, \
             patch('rag.get_embedding_dimension') as mock_dim:
            mock_col = MagicMock()
            mock_col.count.return_value = 0
            mock_get_col.return_value = mock_col
            mock_dim.return_value = 384

            get_collection_stats()
            mock_col.count.assert_called_once()


class TestDeleteChunksForFile:
    def test_deletes_chunks_with_matching_source_file(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.return_value = {
                "ids": ["chunk-a", "chunk-b", "chunk-c"]
            }
            mock_get_col.return_value = mock_col

            result = delete_chunks_for_file("src/utils/helper.py")

            assert result == 3
            mock_col.delete.assert_called_once_with(ids=["chunk-a", "chunk-b", "chunk-c"])

    def test_returns_zero_when_no_chunks_found(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_col

            result = delete_chunks_for_file("nonexistent/file.py")

            assert result == 0
            mock_col.delete.assert_not_called()

    def test_calls_get_with_where_filter(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.return_value = {"ids": []}
            mock_get_col.return_value = mock_col

            delete_chunks_for_file("my/file.ts")

            mock_col.get.assert_called_once()
            call_kwargs = mock_col.get.call_args[1]
            assert call_kwargs['where'] == {"source_file": "my/file.ts"}


class TestCleanupStaleChunks:
    def test_removes_stale_paths_and_returns_correct_structure(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            # Simulate three chunks across two files
            mock_col.get.side_effect = [{
                "metadatas": [
                    {"source_file": "stale.go"},
                    {"source_file": "stale.go"},
                    {"source_file": "keep.ts"},
                ]
            }, {"metadatas": []}, {"metadatas": []}, {"metadatas": []}]
            # delete_chunks_for_file will be called for stale.go
            mock_col.count.return_value = 1
            mock_get_col.return_value = mock_col

            result = cleanup_stale_chunks({"keep.ts"})

            assert 'stale_paths' in result
            assert 'removed_count' in result
            assert 'remaining_count' in result
            assert 'stale.go' in result['stale_paths']
            assert 'keep.ts' not in result['stale_paths']

    def test_returns_empty_when_all_files_are_current(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.side_effect = [{
                "metadatas": [
                    {"source_file": "a.py"},
                    {"source_file": "b.py"},
                ]
            }, {"metadatas": []}]
            mock_col.count.return_value = 2
            mock_get_col.return_value = mock_col

            result = cleanup_stale_chunks({"a.py", "b.py"})

            assert result['stale_paths'] == []
            assert result['removed_count'] == 0

    def test_returns_all_paths_when_current_files_is_empty(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.side_effect = [{
                "metadatas": [
                    {"source_file": "old.py"},
                    {"source_file": "old.tsx"},
                ]
            }, {"metadatas": []}, {"metadatas": []}, {"metadatas": []}, {"metadatas": []}]
            mock_col.count.return_value = 0
            mock_get_col.return_value = mock_col

            result = cleanup_stale_chunks(set())

            assert set(result['stale_paths']) == {"old.py", "old.tsx"}

    def test_skips_metadata_entries_without_source_file(self):
        with patch('rag._get_collection') as mock_get_col:
            mock_col = MagicMock()
            mock_col.get.side_effect = [{
                "metadatas": [
                    {"source_file": "valid.py"},
                    {},
                    {"other_field": "value"},
                ]
            }, {"metadatas": []}]
            mock_col.count.return_value = 1
            mock_get_col.return_value = mock_col

            result = cleanup_stale_chunks({"valid.py"})

            assert result['stale_paths'] == []
            assert result['removed_count'] == 0
