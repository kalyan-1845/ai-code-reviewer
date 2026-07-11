import pytest
from embeddings import (
    _embedding_cache,
    _cache_enabled,
    _MAX_CACHE_SIZE,
    get_cache_stats,
    get_or_compute_embedding,
    embed_text,
    clear_embedding_cache,
)


class TestGetCacheStats:
    """Tests for get_cache_stats() function."""

    def setup_method(self):
        """Clear the cache before each test."""
        _embedding_cache.clear()

    def teardown_method(self):
        """Clear the cache after each test."""
        _embedding_cache.clear()

    def test_returns_dict_with_expected_keys(self):
        """get_cache_stats should return a dict with enabled, size, max_size, keys."""
        stats = get_cache_stats()
        assert isinstance(stats, dict)
        assert "enabled" in stats
        assert "size" in stats
        assert "max_size" in stats
        assert "keys" in stats

    def test_size_reflects_cache_entry_count(self):
        """After adding N entries, size should be N."""
        get_or_compute_embedding("a.py", "content a")
        get_or_compute_embedding("b.py", "content b")
        get_or_compute_embedding("c.py", "content c")
        stats = get_cache_stats()
        assert stats["size"] == 3

    def test_size_is_zero_when_cache_is_empty(self):
        """When cache is empty, size should be 0."""
        stats = get_cache_stats()
        assert stats["size"] == 0

    def test_max_size_matches_constant(self):
        """max_size should match the _MAX_CACHE_SIZE constant."""
        stats = get_cache_stats()
        assert stats["max_size"] == _MAX_CACHE_SIZE

    def test_keys_contains_file_paths(self):
        """keys list should contain file_path strings for cached entries."""
        get_or_compute_embedding("src/main.py", "def main(): pass")
        get_or_compute_embedding("src/utils.py", "def util(): pass")
        stats = get_cache_stats()
        keys = stats["keys"]
        assert isinstance(keys, list)
        assert "src/main.py" in keys
        assert "src/utils.py" in keys

    def test_keys_is_empty_when_cache_is_empty(self):
        """When cache is empty, keys should be an empty list."""
        stats = get_cache_stats()
        assert stats["keys"] == []

    def test_enabled_flag_reflects_cache_state(self):
        """enabled flag should reflect the _cache_enabled state."""
        stats = get_cache_stats()
        assert stats["enabled"] == _cache_enabled

    def test_size_is_zero_after_clear_embedding_cache(self):
        """After clear_embedding_cache(), size should be 0."""
        get_or_compute_embedding("x.py", "content")
        clear_embedding_cache()
        stats = get_cache_stats()
        assert stats["size"] == 0

    def test_keys_is_empty_after_clear_embedding_cache(self):
        """After clear_embedding_cache(), keys should be an empty list."""
        get_or_compute_embedding("y.py", "content")
        clear_embedding_cache()
        stats = get_cache_stats()
        assert stats["keys"] == []

    def test_size_decrements_as_entries_are_added_and_removed(self):
        """Test a sequence: add 2, clear, add 1 — size should reflect current state."""
        get_or_compute_embedding("p.py", "content p")
        get_or_compute_embedding("q.py", "content q")
        assert get_cache_stats()["size"] == 2
        clear_embedding_cache()
        assert get_cache_stats()["size"] == 0
        get_or_compute_embedding("r.py", "content r")
        assert get_cache_stats()["size"] == 1

    def test_size_counts_distinct_file_paths(self):
        """Same file with different content should overwrite, not double-count."""
        get_or_compute_embedding("dup.py", "version 1")
        get_or_compute_embedding("dup.py", "version 2")
        get_or_compute_embedding("dup.py", "version 3")
        stats = get_cache_stats()
        # A single file path key is reused for each version
        assert stats["size"] == 1
        assert stats["keys"] == ["dup.py"]
