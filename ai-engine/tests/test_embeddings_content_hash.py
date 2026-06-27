import pytest
from embeddings import _compute_content_hash


class TestComputeContentHash:
    """Unit tests for _compute_content_hash in ai-engine/embeddings.py.

    This function is identical to the one in vectorstore.py (tested there) but
    lives in embeddings.py without its own dedicated test file. These tests
    ensure SHA-256 content hashing works correctly for edge cases.
    """

    def test_returns_string_type(self):
        result = _compute_content_hash("hello world")
        assert isinstance(result, str)

    def test_returns_valid_sha256_hex_digest_length(self):
        result = _compute_content_hash("hello world")
        # SHA-256 produces 64 hex characters
        assert len(result) == 64
        assert all(c in '0123456789abcdef' for c in result)

    def test_empty_string_returns_valid_sha256(self):
        result = _compute_content_hash("")
        assert isinstance(result, str)
        assert len(result) == 64
        assert all(c in '0123456789abcdef' for c in result)

    def test_same_content_produces_same_hash_deterministically(self):
        content = "def foo(): return 42"
        hash1 = _compute_content_hash(content)
        hash2 = _compute_content_hash(content)
        assert hash1 == hash2

    def test_different_content_produces_different_hash(self):
        h1 = _compute_content_hash("apple")
        h2 = _compute_content_hash("banana")
        assert h1 != h2

    def test_unicode_chinese_characters(self):
        result = _compute_content_hash("\u4e2d\u6587\u4e16\u754c")
        assert isinstance(result, str)
        assert len(result) == 64
        assert all(c in '0123456789abcdef' for c in result)

    def test_unicode_arabic_characters(self):
        result = _compute_content_hash("\u0627\u0644\u0633\u0644\u0627\u0645")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_emoji_content(self):
        result = _compute_content_hash("\U0001F600\U0001F4BB\U0001F40D")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_whitespace_only_string(self):
        result = _compute_content_hash("   \n\t\n  ")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_special_characters_null_bytes(self):
        result = _compute_content_hash("line1\nline2\ttab\0null")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_large_content_100k_chars(self):
        large = "x" * 100_000
        result = _compute_content_hash(large)
        assert isinstance(result, str)
        assert len(result) == 64

    def test_consistent_across_multiple_calls(self):
        content = "test determinism"
        hashes = [_compute_content_hash(content) for _ in range(10)]
        assert len(set(hashes)) == 1

    def test_matches_known_sha256_for_fixed_input(self):
        # SHA-256 of "hello" is a known value
        result = _compute_content_hash("hello")
        known_sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        assert result == known_sha256

    def test_single_character_produces_valid_hash(self):
        result = _compute_content_hash("a")
        assert isinstance(result, str)
        assert len(result) == 64

    def test_leading_and_trailing_whitespace_affects_hash(self):
        h1 = _compute_content_hash("data")
        h2 = _compute_content_hash("  data")
        h3 = _compute_content_hash("data  ")
        assert h1 != h2
        assert h1 != h3
        assert h2 != h3

    def test_newline_variations_produce_different_hashes(self):
        h1 = _compute_content_hash("a\nb")
        h2 = _compute_content_hash("a\n\nb")
        h3 = _compute_content_hash("a\r\nb")
        assert h1 != h2
        assert h2 != h3
        assert h1 != h3
