# Tests for get_chunks_paginated in rag.py
from unittest.mock import MagicMock, patch

import pytest
from rag import get_chunks_paginated


def make_get_result(documents=None, metadatas=None, ids=None):
    return {
        "documents": documents or [],
        "metadatas": metadatas or [],
        "ids": ids or [],
    }


class TestGetChunksPaginated:
    def test_returns_empty_list_when_collection_empty(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = make_get_result()
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(limit=50, offset=0)

            assert result == []

    def test_respects_limit_parameter(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = make_get_result(
                documents=["a", "b"],
                metadatas=[{"f": "1"}, {"f": "2"}],
                ids=["id-1", "id-2"],
            )
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(limit=1, offset=0)

            assert len(result) == 2
            mock_collection.get.assert_called_once_with(limit=1, offset=0)

    def test_respects_offset_parameter(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = make_get_result(
                documents=["c", "d"],
                metadatas=[{"f": "3"}, {"f": "4"}],
                ids=["id-3", "id-4"],
            )
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated(limit=50, offset=10)

            assert len(result) == 2
            mock_collection.get.assert_called_once_with(limit=50, offset=10)

    def test_constructs_correct_chunk_dict_shape(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = make_get_result(
                documents=["content-1"],
                metadatas=[{"source": "test.py"}],
                ids=["chunk-1"],
            )
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated()

            assert len(result) == 1
            chunk = result[0]
            assert chunk["chunk_id"] == "chunk-1"
            assert chunk["content"] == "content-1"
            assert chunk["metadata"] == {"source": "test.py"}

    def test_handles_missing_documents_key(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"metadatas": [], "ids": []}
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated()

            assert result == []

    def test_handles_missing_metadatas_key(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.get.return_value = {"documents": ["x"], "ids": ["1"]}
            mock_get_col.return_value = mock_collection

            result = get_chunks_paginated()

            assert len(result) == 1
            assert result[0]["metadata"] == {}

    def test_paginated_pages_return_sequential_items(self):
        with patch("rag._get_collection") as mock_get_col:
            mock_collection = MagicMock()

            def side_effect(limit, offset):
                if offset == 0:
                    return make_get_result(
                        documents=["first"],
                        metadatas=[{"idx": 0}],
                        ids=["id-0"],
                    )
                elif offset == 1:
                    return make_get_result(
                        documents=["second"],
                        metadatas=[{"idx": 1}],
                        ids=["id-1"],
                    )
                return make_get_result()

            mock_collection.get.side_effect = side_effect
            mock_get_col.return_value = mock_collection

            page0 = get_chunks_paginated(limit=1, offset=0)
            assert page0[0]["chunk_id"] == "id-0"

            page1 = get_chunks_paginated(limit=1, offset=1)
            assert page1[0]["chunk_id"] == "id-1"
