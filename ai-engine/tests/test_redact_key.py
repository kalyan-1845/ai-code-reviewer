# sentence-transformers tries to download a model on import which hangs in CI,
# so we mock it before importing app.
import sys
from unittest.mock import MagicMock

class _MockSentenceTransformer:
    def __init__(self, *args, **kwargs): pass
    def encode(self, *args, **kwargs): pass
    def get_sentence_embedding_dimension(self): return 384


import pytest
from app import _redact_key


class TestRedactKey:
    def test_returns_same_text_when_key_is_not_present(self):
        text = "This is a normal error message without secrets."
        result = _redact_key(text, "secret-key-12345")
        assert result == text

    def test_replaces_single_occurrence_of_key(self):
        text = "Failed to authenticate with key secret-key-12345 please retry"
        result = _redact_key(text, "secret-key-12345")
        assert "secret-key-12345" not in result
        assert "***" in result

    def test_replaces_multiple_occurrences_of_key(self):
        text = "key1 used, key1 confirmed, key1 failed"
        result = _redact_key(text, "key1")
        assert result.count("***") == 3
        assert "key1" not in result

    def test_handles_short_key_8_chars(self):
        text = "Token abcdefgh was rejected"
        result = _redact_key(text, "abcdefgh")
        assert "abcdefgh" not in result
        assert "***" in result

    def test_handles_short_key_less_than_8_chars(self):
        text = "Auth failed with token short"
        result = _redact_key(text, "tok")
        assert "tok" not in result
        assert "***" in result

    def test_returns_text_unchanged_when_key_is_none(self):
        text = "Some error occurred"
        result = _redact_key(text, None)
        assert result == text

    def test_returns_text_unchanged_when_text_is_none(self):
        result = _redact_key(None, "some-key")
        assert result is None

    def test_returns_text_unchanged_when_text_is_empty_string(self):
        result = _redact_key("", "some-key")
        assert result == ""

    def test_handles_key_longer_than_text(self):
        text = "short"
        result = _redact_key(text, "this-is-a-very-long-key-that-is-longer")
        assert result == text

    def test_partial_key_overlap_different_keys(self):
        text = "key1 and key1-full are different"
        result = _redact_key(text, "key1")
        assert "key1" not in result
        # key1-full should still contain "key1" which would also be redacted
        assert "***" in result
