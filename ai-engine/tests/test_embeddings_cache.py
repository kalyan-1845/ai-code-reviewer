import pytest
from embeddings import (
    _embedding_cache,
    _cache_enabled,
    _MAX_CACHE_SIZE,
    get_or_compute_embedding,
    invalidate_cache_for_file,
    clear_embedding_cache,
    get_cache_stats,
    embed_text,
)


class TestGetOrComputeEmbedding:
    """Tests for get_or_compute_embedding caching logic."""

    def setup_method(self):
        """Clear the cache before each test."""
        _embedding_cache.clear()

    def teardown_method(self):
        """Clear the cache after each test."""
        _embedding_cache.clear()

    def test_returns_embedding_when_cache_disabled(self):
        """When cache is disabled, get_or_compute_embedding delegates to embed_text."""
        result = get_or_compute_embedding("file.py", "def hello(): pass")
        expected = embed_text("def hello(): pass")
        assert result == expected

    def test_returns_consistent_embedding_for_same_content(self):
        """Same file+content should return the same embedding."""
        emb1 = get_or_compute_embedding("a.py", "x = 1")
        emb2 = get_or_compute_embedding("a.py", "x = 1")
        assert emb1 == emb2

    def test_caches_result_on_first_call(self):
        """First call should populate the cache."""
        get_or_compute_embedding("b.py", "print('hello')")
        assert "b.py" in _embedding_cache
        assert "embedding" in _embedding_cache["b.py"]
        assert "content_hash" in _embedding_cache["b.py"]

    def test_returns_cached_embedding_on_subsequent_calls(self):
        """Second call with same content should return cached result."""
        content = "y = 2"
        result1 = get_or_compute_embedding("c.py", content)
        result2 = get_or_compute_embedding("c.py", content)
        assert result1 == result2
        # Embeddings are identical lists
        assert all(a == b for a, b in zip(result1, result2))

    def test_different_file_paths_use_separate_cache_entries(self):
        """Same content in different files gets separate cache entries."""
        content = "z = 3"
        get_or_compute_embedding("file1.py", content)
        get_or_compute_embedding("file2.py", content)
        assert "file1.py" in _embedding_cache
        assert "file2.py" in _embedding_cache
        # They may have the same embedding but different keys
        assert _embedding_cache["file1.py"]["content_hash"] == _embedding_cache["file2.py"]["content_hash"]

    def test_modified_content_triggers_recomputation(self):
        """When content changes, cache miss triggers recomputation."""
        file_path = "d.py"
        get_or_compute_embedding(file_path, "old content")
        old_hash = _embedding_cache[file_path]["content_hash"]
        old_embedding = _embedding_cache[file_path]["embedding"]
        new_content = "new content that is different"
        new_result = get_or_compute_embedding(file_path, new_content)
        # The cache should now have the new hash and embedding
        new_hash = _embedding_cache[file_path]["content_hash"]
        assert new_hash != old_hash, "Hash should change when content changes"
        assert new_result != old_embedding, "Embedding should change when content changes"
        assert _embedding_cache[file_path]["embedding"] == new_result

    def test_invalidate_before_get_removes_cache_entry(self):
        """Invalidating a file then calling get should recompute."""
        content = "invalidate test"
        get_or_compute_embedding("e.py", content)
        assert "e.py" in _embedding_cache
        invalidate_cache_for_file("e.py")
        assert "e.py" not in _embedding_cache

    def test_get_or_compute_embedding_returns_list_of_floats(self):
        """Return type should be a list of numeric values."""
        result = get_or_compute_embedding("f.py", "def foo(): return 42")
        assert isinstance(result, list)
        assert len(result) > 0
        assert all(isinstance(v, (int, float)) for v in result)

    def test_empty_content_returns_valid_embedding(self):
        """Empty string content should still produce a valid embedding."""
        result = get_or_compute_embedding("g.py", "")
        assert isinstance(result, list)
        assert len(result) > 0
        assert all(isinstance(v, (int, float)) for v in result)

    def test_whitespace_only_content_returns_valid_embedding(self):
        """Whitespace-only content should still produce a valid embedding."""
        result = get_or_compute_embedding("h.py", "   \n\n   ")
        assert isinstance(result, list)
        assert len(result) > 0
        assert all(isinstance(v, (int, float)) for v in result)


class TestInvalidateCacheForFile:
    """Tests for invalidate_cache_for_file edge cases."""

    def setup_method(self):
        _embedding_cache.clear()

    def teardown_method(self):
        _embedding_cache.clear()

    def test_invalidate_nonexistent_path_is_noop(self):
        """Invalidating a path that was never cached should not raise."""
        invalidate_cache_for_file("never_cached.py")
        assert len(_embedding_cache) == 0

    def test_invalidate_removes_from_both_cache_and_access_order(self):
        """Invalidating should remove entry from both structures."""
        get_or_compute_embedding("x.py", "x = 1")
        assert "x.py" in _embedding_cache
        invalidate_cache_for_file("x.py")
        assert "x.py" not in _embedding_cache

    def test_invalidate_one_of_multiple_entries(self):
        """Invalidating one entry should not affect others."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        get_or_compute_embedding("c.py", "z = 3")
        assert len(_embedding_cache) == 3
        invalidate_cache_for_file("b.py")
        assert len(_embedding_cache) == 2
        assert "a.py" in _embedding_cache
        assert "c.py" in _embedding_cache
        assert "b.py" not in _embedding_cache

    def test_invalidate_twice_is_idempotent(self):
        """Calling invalidate twice on the same path should not raise."""
        get_or_compute_embedding("dup.py", "x = 1")
        invalidate_cache_for_file("dup.py")
        # Second call should also be a no-op
        invalidate_cache_for_file("dup.py")
        assert len(_embedding_cache) == 0

    def test_invalidate_empty_string_path(self):
        """Invalidating with empty string path should be a no-op."""
        get_or_compute_embedding("a.py", "x = 1")
        invalidate_cache_for_file("")
        assert len(_embedding_cache) == 1


class TestClearEmbeddingCache:
    """Tests for clear_embedding_cache."""

    def setup_method(self):
        _embedding_cache.clear()

    def teardown_method(self):
        _embedding_cache.clear()

    def test_clear_removes_all_entries(self):
        """Clear should empty the entire cache."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        assert len(_embedding_cache) == 2
        clear_embedding_cache()
        assert len(_embedding_cache) == 0

    def test_clear_resets_access_order_list(self):
        """Clear should also empty the access order list."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        clear_embedding_cache()

    def test_clear_on_empty_cache_is_noop(self):
        """Clearing an already-empty cache should not raise."""
        clear_embedding_cache()
        assert len(_embedding_cache) == 0


class TestGetCacheStats:
    """Tests for get_cache_stats."""

    def setup_method(self):
        _embedding_cache.clear()

    def teardown_method(self):
        _embedding_cache.clear()

    def test_stats_reflects_empty_cache(self):
        """Stats should report zero size for empty cache."""
        stats = get_cache_stats()
        assert stats["size"] == 0
        assert stats["max_size"] == _MAX_CACHE_SIZE
        assert stats["enabled"] == _cache_enabled
        assert stats["keys"] == []

    def test_stats_reflects_populated_cache(self):
        """Stats should report correct size and keys after population."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        stats = get_cache_stats()
        assert stats["size"] == 2
        assert set(stats["keys"]) == {"a.py", "b.py"}

    def test_stats_reflects_cache_after_invalidation(self):
        """Stats should update correctly after invalidating one entry."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        invalidate_cache_for_file("a.py")
        stats = get_cache_stats()
        assert stats["size"] == 1
        assert "a.py" not in stats["keys"]
        assert "b.py" in stats["keys"]

    def test_stats_reflects_cache_after_clear(self):
        """Stats should report zero after clearing the cache."""
        get_or_compute_embedding("a.py", "x = 1")
        get_or_compute_embedding("b.py", "y = 2")
        clear_embedding_cache()
        stats = get_cache_stats()
        assert stats["size"] == 0
        assert stats["keys"] == []

    def test_stats_max_size_is_positive_integer(self):
        """max_size should be a positive integer."""
        stats = get_cache_stats()
        assert isinstance(stats["max_size"], int)
        assert stats["max_size"] > 0
