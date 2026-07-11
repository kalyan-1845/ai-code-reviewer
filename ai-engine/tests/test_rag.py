import os
import pytest
import sys
from unittest.mock import patch, MagicMock
import numpy as np

os.environ["CHROMA_HOST"] = ""
os.environ["CHROMA_PERSIST_DIR"] = ""

import chromadb
import rag


@pytest.fixture(autouse=True)
def fresh_rag_state():
    rag._client = None
    yield
    rag._client = None


@pytest.fixture
def isolated_collection(request):
    test_name = request.node.name.replace("[", "_").replace("]", "_").replace(" ", "_")
    collection_name = f"test_{test_name}_{id(request)}"
    client = chromadb.EphemeralClient()
    collection = client.get_or_create_collection(
        collection_name,
        metadata={"hnsw:space": "cosine"},
    )
    with patch.object(rag, "_get_client", return_value=client):
        with patch.object(rag, "_get_collection", return_value=collection):
            yield collection


class TestIngestChunks:
    def test_ingest_chunks_returns_count(self, isolated_collection):
        chunks = ["def foo(): pass", "class Bar: pass"]
        metadatas = [{"source": "test.py"}, {"source": "test2.py"}]
        ids = ["id0", "id1"]
        count = rag.ingest_chunks(chunks, metadatas, ids)
        assert count == 2

    def test_ingest_chunks_stores_chunks(self, isolated_collection):
        chunks = ["x = 1"]
        metadatas = [{"f": "a.py"}]
        ids = ["c0"]
        rag.ingest_chunks(chunks, metadatas, ids)
        assert isolated_collection.count() == 1

    def test_ingest_chunks_returns_correct_count_mock(self):
        with patch("rag._get_collection") as mock_get_coll:
            mock_collection = MagicMock()
            mock_get_coll.return_value = mock_collection
            mock_collection.count.return_value = 0

            from rag import ingest_chunks
            result = ingest_chunks(
                chunks=["hello world"],
                metadatas=[{"source": "test.py"}],
                ids=["chunk-0"],
            )
            assert result == 1
            mock_collection.add.assert_called_once()

    def test_ingest_chunks_calls_add_with_correct_args(self):
        with patch("rag._get_collection") as mock_get_coll:
            mock_collection = MagicMock()
            mock_get_coll.return_value = mock_collection
            mock_collection.count.return_value = 0

            from rag import ingest_chunks
            chunks = ["chunk one", "chunk two"]
            metadatas = [{"file": "a.py"}, {"file": "b.py"}]
            ids = ["id-0", "id-1"]
            ingest_chunks(chunks, metadatas, ids)
            call_kwargs = mock_collection.add.call_args.kwargs
            assert call_kwargs["documents"] == chunks
            assert call_kwargs["metadatas"] == metadatas
            assert call_kwargs["ids"] == ids

    def test_ingest_chunks_empty_list_returns_zero(self):
        with patch("rag._get_collection") as mock_get_coll:
            mock_collection = MagicMock()
            mock_get_coll.return_value = mock_collection
            mock_collection.count.return_value = 0

            from rag import ingest_chunks
            result = ingest_chunks([], [], [])
            assert result == 0


class TestQueryChunks:
    def test_query_chunks_returns_list_of_dicts(self, isolated_collection):
        chunks = ["python function definition syntax", "javascript arrow function"]
        metadatas = [{"lang": "py"}, {"lang": "js"}]
        ids = ["q0", "q1"]
        rag.ingest_chunks(chunks, metadatas, ids)

        results = rag.query_chunks("function syntax", n_results=2)

        assert isinstance(results, list)
        assert len(results) == 2
        assert all("chunk_id" in r for r in results)
        assert all("content" in r for r in results)
        assert all("metadata" in r for r in results)
        assert all("similarity_score" in r for r in results)

    def test_query_chunks_with_empty_collection(self, isolated_collection):
        results = rag.query_chunks("anything", n_results=5)
        assert results == []

    def test_query_chunks_n_results_respected(self, isolated_collection):
        chunks = ["apple fruit", "banana fruit", "cherry fruit", "date fruit", "elderberry"]
        metadatas = [{"i": i} for i in range(5)]
        ids = [f"r{i}" for i in range(5)]
        rag.ingest_chunks(chunks, metadatas, ids)

        results = rag.query_chunks("fruit", n_results=3)
        assert len(results) == 3


class TestGetCollectionStats:
    def test_returns_collection_stats_dict(self, isolated_collection):
        chunks = ["test content"]
        metadatas = [{"t": "1"}]
        ids = ["s0"]
        rag.ingest_chunks(chunks, metadatas, ids)

        stats = rag.get_collection_stats()

        assert isinstance(stats, dict)
        assert "collection" in stats
        assert "chunk_count" in stats
        assert "embedding_dimension" in stats
        assert stats["collection"] == rag._COLLECTION_NAME
        assert stats["chunk_count"] >= 1
        assert isinstance(stats["embedding_dimension"], int)
        assert stats["embedding_dimension"] > 0

    def test_get_collection_stats_returns_expected_keys_mock(self):
        with patch("rag._get_collection") as mock_get_coll:
            mock_collection = MagicMock()
            mock_collection.count.return_value = 42
            mock_get_coll.return_value = mock_collection

            from rag import get_collection_stats
            result = get_collection_stats()
            assert "collection" in result
            assert "chunk_count" in result
            assert "embedding_dimension" in result
            assert result["chunk_count"] == 42
            assert result["embedding_dimension"] == 384

    def test_get_collection_stats_zero_count(self):
        with patch("rag._get_collection") as mock_get_coll:
            mock_collection = MagicMock()
            mock_collection.count.return_value = 0
            mock_get_coll.return_value = mock_collection

            from rag import get_collection_stats
            result = get_collection_stats()
            assert result["chunk_count"] == 0
            assert result["collection"] == "reposage_code_chunks"
