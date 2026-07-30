import hashlib
import pytest
from unittest.mock import MagicMock
from services.cache_manager import CacheManager, DEFAULT_TTL_SECONDS
from src.graph.nodes import reviewer_node


def test_normalize_and_hash():
    diff1 = "  diff --git a/file.py b/file.py\n+print('hello')  \n"
    diff2 = "diff --git a/file.py b/file.py\n+print('hello')"

    hash1 = CacheManager.normalize_and_hash(diff1)
    hash2 = CacheManager.normalize_and_hash(diff2)

    assert hash1 == hash2
    expected_hash = hashlib.sha256(diff2.encode("utf-8")).hexdigest()
    assert hash1 == expected_hash
    assert CacheManager.normalize_and_hash("") == ""


def test_cache_manager_get_set_success():
    mock_redis = MagicMock()
    mock_redis.get.return_value = b"Cached micro review content"
    cache = CacheManager(redis_client=mock_redis)

    diff_hash = cache.normalize_and_hash("+ line of code")
    
    # Test Get
    cached = cache.get_cached_review(diff_hash)
    assert cached == "Cached micro review content"
    mock_redis.get.assert_called_once_with(f"diff_hash:{diff_hash}")

    # Test Set
    success = cache.set_cached_review(diff_hash, "New review text")
    assert success is True
    mock_redis.setex.assert_called_once_with(
        f"diff_hash:{diff_hash}",
        DEFAULT_TTL_SECONDS,
        "New review text"
    )
    assert DEFAULT_TTL_SECONDS == 604800


def test_cache_manager_redis_exception_fallback():
    mock_redis = MagicMock()
    mock_redis.get.side_effect = Exception("Redis connection refused")
    mock_redis.setex.side_effect = Exception("Redis connection refused")

    cache = CacheManager(redis_client=mock_redis)
    diff_hash = "abc123hash"

    # Should gracefully return None/False without crashing
    assert cache.get_cached_review(diff_hash) is None
    assert cache.set_cached_review(diff_hash, "some review") is False


def test_reviewer_node_cache_miss_and_hit():
    mock_cache = MagicMock()
    mock_cache.normalize_and_hash.return_value = "dummy_hash_123"
    mock_cache.get_cached_review.return_value = None  # Miss first

    state = {
        "chunks": ["diff --git a/a.py b/a.py\n+x = 1"],
        "current_index": 0,
        "micro_reviews": []
    }

    # First invocation -> Cache Miss
    res1 = reviewer_node(state, cache_manager=mock_cache)
    assert len(res1["micro_reviews"]) == 1
    assert "Micro-review for chunk 1/1" in res1["micro_reviews"][0]
    mock_cache.set_cached_review.assert_called_once()

    # Second invocation with Cache Hit
    mock_cache.get_cached_review.return_value = "Cached Review Result"
    state2 = {
        "chunks": ["diff --git a/a.py b/a.py\n+x = 1"],
        "current_index": 0,
        "micro_reviews": []
    }
    res2 = reviewer_node(state2, cache_manager=mock_cache)
    assert res2["micro_reviews"][0] == "Cached Review Result"
