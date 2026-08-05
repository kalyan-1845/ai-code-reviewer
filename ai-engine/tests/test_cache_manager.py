import sys, os
sub_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if sub_dir not in sys.path: sys.path.insert(0, sub_dir)
if root_dir not in sys.path: sys.path.insert(0, root_dir)

import pytest
from unittest.mock import patch, MagicMock

# Safely handle missing redis package in testing environments
try:
    import redis
except ImportError:
    redis = MagicMock()
    class DummyConnectionError(Exception):
        pass
    redis.exceptions.ConnectionError = DummyConnectionError
    sys.modules["redis"] = redis

from services.cache_manager import compute_hash, get_cached_review, set_cached_review
from src.graph.nodes import reviewer_node
from src.graph.state import AgentState


def test_sha256_hash_consistency():
    diff1 = "diff --git a/file.py b/file.py\n+print('hello')"
    diff2 = "diff --git a/file.py b/file.py\n+print('hello')\n  "
    
    hash1 = compute_hash(diff1)
    hash2 = compute_hash(diff2)
    
    # Verify hash normalization (stripping outer whitespace)
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 output length
    
    diff_different = "diff --git a/file.py b/file.py\n+print('world')"
    hash_different = compute_hash(diff_different)
    assert hash1 != hash_different


@patch("redis.Redis.from_url")
def test_cache_hit_and_llm_bypass(mock_from_url):
    mock_client = MagicMock()
    mock_from_url.return_value = mock_client
    
    chunk_diff = "diff --git a/app.py b/app.py\n+def foo(): pass"
    hash_key = compute_hash(chunk_diff)
    cached_content = "Cached Micro-review: Code looks optimal."
    
    mock_client.get.return_value = cached_content
    
    # Verify direct get_cached_review return
    result = get_cached_review(hash_key)
    assert result == cached_content
    mock_client.get.assert_called_with(hash_key)
    
    # Verify reviewer_node cache hit bypasses LLM call
    state: AgentState = {
        "chunks": [chunk_diff],
        "current_index": 0,
        "micro_reviews": [],
    }
    node_res = reviewer_node(state)
    assert node_res["is_cached"] is True
    assert cached_content in node_res["micro_reviews"]
    # Ensure set_cached_review was not called on cache hit
    mock_client.set.assert_not_called()


@patch("redis.Redis.from_url")
def test_cache_miss_and_write_cache(mock_from_url):
    mock_client = MagicMock()
    mock_from_url.return_value = mock_client
    
    chunk_diff = "diff --git a/new.py b/new.py\n+x = 42"
    hash_key = compute_hash(chunk_diff)

    mock_client.get.return_value = None  # Cache Miss

    from src.graph.nodes import set_reviewer_llm_caller
    set_reviewer_llm_caller(
        lambda system_prompt, user_prompt: "Review for chunk 1/1: LLM output"
    )

    state: AgentState = {
        "chunks": [chunk_diff],
        "current_index": 0,
        "micro_reviews": [],
    }
    node_res = reviewer_node(state)
    assert node_res["is_cached"] is False
    assert len(node_res["micro_reviews"]) == 1
    assert node_res["micro_reviews"][0] == "Review for chunk 1/1: LLM output"

    # Verify write back to Redis with 7-day TTL (604800 seconds)
    mock_client.set.assert_called_once()
    args, kwargs = mock_client.set.call_args
    assert args[0] == hash_key
    assert args[1] == "Review for chunk 1/1: LLM output"
    assert kwargs.get("ex") == 604800


@patch("redis.Redis.from_url")
def test_cache_miss_review_originates_from_llm_not_fallback(mock_from_url):
    mock_client = MagicMock()
    mock_from_url.return_value = mock_client

    chunk_diff = "diff --git a/llm.py b/llm.py\n+def process():\n+    pass"
    hash_key = compute_hash(chunk_diff)
    mock_client.get.return_value = None  # Cache Miss

    from src.graph.nodes import set_reviewer_llm_caller
    captured = {}
    def fake_llm(system_prompt, user_prompt):
        captured["user_prompt"] = user_prompt
        return "LLM-generated micro-review for this chunk"

    set_reviewer_llm_caller(fake_llm)

    state: AgentState = {
        "chunks": [chunk_diff],
        "current_index": 0,
        "micro_reviews": [],
    }
    node_res = reviewer_node(state)
    assert node_res["is_cached"] is False
    # The cached/appended review is the mocked LLM output, not the fallback literal
    assert node_res["micro_reviews"][0] == "LLM-generated micro-review for this chunk"
    assert "No critical flaws detected" not in node_res["micro_reviews"][0]

    mock_client.set.assert_called_once()
    args, kwargs = mock_client.set.call_args
    assert args[0] == hash_key
    assert args[1] == "LLM-generated micro-review for this chunk"


@patch("redis.Redis.from_url")
def test_reviewer_node_raises_when_llm_unavailable(mock_from_url):
    from src.graph.nodes import set_reviewer_llm_caller
    set_reviewer_llm_caller(None)

    mock_client = MagicMock()
    mock_from_url.return_value = mock_client
    mock_client.get.return_value = None  # Cache Miss

    chunk_diff = "diff --git a/x.py b/x.py\n+x = 1"

    state: AgentState = {
        "chunks": [chunk_diff],
        "current_index": 0,
        "micro_reviews": [],
    }
    with pytest.raises(RuntimeError):
        reviewer_node(state)
    # Nothing fabricated should be cached when the LLM is unavailable
    mock_client.set.assert_not_called()


@patch("redis.Redis.from_url")
def test_redis_connection_error_fail_open(mock_from_url):
    mock_client = MagicMock()
    mock_from_url.return_value = mock_client
    
    # Simulate Redis connection failure
    mock_client.get.side_effect = redis.exceptions.ConnectionError("Redis connection refused")
    mock_client.set.side_effect = redis.exceptions.ConnectionError("Redis connection refused")
    
    chunk_diff = "diff --git a/test.py b/test.py\n+import os"
    hash_key = compute_hash(chunk_diff)
    
    # get_cached_review should fail open (return None) without crashing
    res = get_cached_review(hash_key)
    assert res is None
    
    # set_cached_review should fail open without raising exception
    set_cached_review(hash_key, "some review")
    
    # reviewer_node should complete without throwing exceptions
    state: AgentState = {
        "chunks": [chunk_diff],
        "current_index": 0,
        "micro_reviews": [],
    }
    node_res = reviewer_node(state)
    assert node_res["is_cached"] is False
    assert len(node_res["micro_reviews"]) == 1
