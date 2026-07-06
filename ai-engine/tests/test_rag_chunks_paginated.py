# Mock heavy dependencies before importing rag.
import sys
from unittest.mock import MagicMock, patch

import pytest
from rag import get_chunks_paginated


class TestGetChunksPaginated:

    def test_returns_empty_list_when_collection_is_empty(self):
        """When collection has no documents, an empty list is returned."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"documents": [], "metadatas": [], "ids": []}
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(repo_url="https://github.com/example/empty")

            assert result == []

    def test_respects_limit_parameter(self):
        """collection.get is called with the limit parameter."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            docs = [f"content-{i}" for i in range(10)]
            mock_collection.get.return_value = {
                "documents": docs,
                "metadatas": [{}] * 10,
                "ids": [f"id-{i}" for i in range(10)],
            }
            mock_get_col.return_value = mock_collection

            get_chunks_paginated(limit=3, repo_url="https://github.com/example/repo")

            mock_collection.get.assert_called_with(limit=3, offset=0)

    def test_respects_offset_parameter(self):
        """collection.get is called with the correct offset."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"documents": [], "metadatas": [], "ids": []}
            mock_get_col.return_value = mock_collection

            get_chunks_paginated(limit=50, offset=100, repo_url="https://github.com/example/repo")

            mock_collection.get.assert_called_once_with(limit=50, offset=100)

    def test_constructs_correct_chunk_dict_shape(self):
        """Each returned chunk has chunk_id, content, and metadata keys."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "documents": ["def hello(): pass"],
                "metadatas": [{"source_file": "hello.py"}],
                "ids": ["id-1"],
            }
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(repo_url="https://github.com/example/repo")

            assert len(result) == 1
            chunk = result[0]
            assert "chunk_id" in chunk
            assert "content" in chunk
            assert "metadata" in chunk
            assert chunk["content"] == "def hello(): pass"
            assert chunk["metadata"] == {"source_file": "hello.py"}

    def test_handles_missing_documents_key_in_response(self):
        """If documents key is missing, treat as empty list."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"metadatas": [], "ids": []}
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(repo_url="https://github.com/example/repo")

            assert result == []

    def test_handles_missing_metadatas_key_in_response(self):
        """If metadatas key is missing, empty dict is used for each chunk."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "documents": ["content-a", "content-b"],
                "ids": ["id-a", "id-b"],
            }
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(repo_url="https://github.com/example/repo")

            assert len(result) == 2
            assert result[0]["metadata"] == {}
            assert result[1]["metadata"] == {}

    def test_paginated_pages_return_correct_sequential_items(self):
        """Offset correctly skips the first N chunks."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            # Both calls return the same 3 docs
            docs = ["first", "second", "third"]
            mock_collection.get.side_effect = [
                # offset=0 page
                {"documents": docs, "metadatas": [{}]*3, "ids": ["id-0","id-1","id-2"]},
                # offset=3 page (skip first 3)
                {"documents": ["fourth", "fifth"], "metadatas": [{}]*2, "ids": ["id-3","id-4"]},
            ]
            mock_get_col.return_value = mock_collection

            page1 = get_chunks_paginated(limit=3, offset=0, repo_url="https://github.com/example/repo")
            page2 = get_chunks_paginated(limit=3, offset=3, repo_url="https://github.com/example/repo")

            assert [c["content"] for c in page1] == ["first", "second", "third"]
            assert [c["content"] for c in page2] == ["fourth", "fifth"]

    def test_handles_ids_shorter_than_documents(self):
        """If ids list is shorter than documents, None is used for missing ids."""
        with patch('rag._get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {
                "documents": ["doc-a", "doc-b", "doc-c"],
                "metadatas": [{}]*3,
                "ids": ["id-a"],  # only 1 id for 3 docs
            }
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(repo_url="https://github.com/example/repo")

            assert len(result) == 3
            assert result[0]["chunk_id"] == "id-a"
            assert result[1]["chunk_id"] is None
            assert result[2]["chunk_id"] is None
