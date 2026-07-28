import pytest
from services.vector_store import store_chunks, retrieve_top_k, clear_collection


def test_vector_store_flow():
    collection = "test-session-suite"
    clear_collection(collection)

    test_chunks = [
        {
            "chunk_id": "c1",
            "content": "def calculate_total(prices):\n    return sum(prices)",
            "metadata": {"source_file": "billing.py", "start_line": 1, "end_line": 2}
        },
        {
            "chunk_id": "c2",
            "content": "class UserProfile:\n    def __init__(self, name):\n        self.name = name",
            "metadata": {"source_file": "user.py", "start_line": 1, "end_line": 3}
        }
    ]

    stored_count = store_chunks(test_chunks, collection_name=collection)
    assert stored_count == 2

    results = retrieve_top_k("def calculate_total", collection_name=collection, k=1)
    assert len(results) == 1
    assert results[0]["chunk_id"] == "c1"

    clear_collection(collection)
    results_after_clear = retrieve_top_k("calculate", collection_name=collection, k=5)
    assert len(results_after_clear) == 0


def test_empty_operations():
    collection = "test-empty-session"
    assert store_chunks([], collection_name=collection) == 0
    assert retrieve_top_k("", collection_name=collection) == []
