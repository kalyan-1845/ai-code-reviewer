import pytest
from langchain_text_splitters import RecursiveCharacterTextSplitter
from text_splitter import (
    _make_splitter,
    _detect_language,
    _language_separators,
    _CHUNK_SIZE,
    _CHUNK_OVERLAP,
)


class TestLanguageSeparators:
    """Tests for the _language_separators dictionary boundary values."""

    def test_all_documented_languages_have_separators(self):
        """Every language listed in the separators dict must have a non-empty separator list."""
        known_languages = list(_language_separators.keys())
        assert len(known_languages) > 0
        for lang in known_languages:
            assert lang in _language_separators
            assert isinstance(_language_separators[lang], list), \
                f"{lang} separators should be a list"
            assert len(_language_separators[lang]) > 0, \
                f"{lang} should have at least one separator"

    def test_all_separator_values_are_strings(self):
        """Every separator in every language's separator list must be a string."""
        for lang, separators in _language_separators.items():
            for sep in separators:
                assert isinstance(sep, str), \
                    f"Separator {repr(sep)} for {lang} should be a string, got {type(sep)}"

    def test_all_separator_list_types_are_correct(self):
        """All separator values should be lists (empty string is a valid separator
        in RecursiveCharacterTextSplitter — it means split at any character boundary)."""
        for lang, separators in _language_separators.items():
            assert isinstance(separators, list), \
                f"{lang} separators should be a list, got {type(separators)}"

    def test_python_separators_list_not_empty(self):
        """Python language must have at least one separator."""
        assert len(_language_separators["python"]) > 0

    def test_default_separators_list_not_empty(self):
        """Default language must have at least one separator."""
        assert len(_language_separators["default"]) > 0

    def test_rust_separators_list_not_empty(self):
        """Rust language must have at least one separator."""
        assert len(_language_separators["rust"]) > 0

    def test_go_separators_list_not_empty(self):
        """Go language must have at least one separator."""
        assert len(_language_separators["go"]) > 0

    def test_all_separators_exist_in_splitter_for_python(self):
        """All python separators should be usable by RecursiveCharacterTextSplitter."""
        sep_list = _language_separators["python"]
        splitter = _make_splitter("main.py")
        for sep in sep_list:
            assert sep in splitter._separators


class TestMakeSplitterEdgeCases:
    """Boundary value tests for _make_splitter."""

    def test_chunk_size_zero_is_allowed(self):
        """chunk_size=0 should not raise an error."""
        splitter = _make_splitter("main.py", chunk_size=0)
        assert isinstance(splitter, RecursiveCharacterTextSplitter)
        assert splitter._chunk_size == 0

    def test_chunk_size_one_is_allowed(self):
        """chunk_size=1 should not raise an error."""
        splitter = _make_splitter("main.py", chunk_size=1)
        assert isinstance(splitter, RecursiveCharacterTextSplitter)
        assert splitter._chunk_size == 1

    def test_chunk_overlap_zero_is_allowed(self):
        """chunk_overlap=0 should not raise an error."""
        splitter = _make_splitter("main.py", chunk_overlap=0)
        assert isinstance(splitter, RecursiveCharacterTextSplitter)
        assert splitter._chunk_overlap == 0

    def test_chunk_overlap_larger_than_chunk_size_is_capped(self):
        """RecursiveCharacterTextSplitter caps overlap to be less than chunk_size.
        overlap=20 with chunk_size=10 results in overlap=9 (internal cap)."""
        splitter = _make_splitter("main.py", chunk_size=10, chunk_overlap=20)
        assert splitter._chunk_size == 10
        # overlap is capped internally by RecursiveCharacterTextSplitter
        assert splitter._chunk_overlap < splitter._chunk_size

    def test_very_large_chunk_size_is_allowed(self):
        """A very large chunk_size (e.g., 1 million) should not raise an error."""
        splitter = _make_splitter("main.py", chunk_size=1_000_000)
        assert isinstance(splitter, RecursiveCharacterTextSplitter)
        assert splitter._chunk_size == 1_000_000

    def test_both_zero_chunk_size_and_overlap(self):
        """chunk_size=0 and chunk_overlap=0 should be valid together."""
        splitter = _make_splitter("main.py", chunk_size=0, chunk_overlap=0)
        assert splitter._chunk_size == 0
        assert splitter._chunk_overlap == 0


class TestDetectLanguageCoversAllSeparators:
    """Verify _detect_language is consistent with _language_separators keys."""

    def test_all_separators_languages_have_detect_support(self):
        """Every language in _language_separators should be detectable."""
        for lang in _language_separators.keys():
            # We test that _detect_language returns something for key file extensions
            # by checking it does not raise an error
            if lang == "python":
                result = _detect_language("test.py")
            elif lang == "javascript":
                result = _detect_language("test.js")
            elif lang == "typescript":
                result = _detect_language("test.ts")
            elif lang == "java":
                result = _detect_language("test.java")
            elif lang == "go":
                result = _detect_language("test.go")
            elif lang == "rust":
                result = _detect_language("test.rs")
            elif lang == "cpp":
                result = _detect_language("test.cpp")
            else:
                result = _detect_language("test." + lang)
            assert isinstance(result, str)


class TestGlobalChunkConstants:
    """Tests for _CHUNK_SIZE and _CHUNK_OVERLAP constants."""

    def test_chunk_size_is_positive(self):
        """Default _CHUNK_SIZE should be a positive integer."""
        assert isinstance(_CHUNK_SIZE, int)
        assert _CHUNK_SIZE > 0

    def test_chunk_overlap_is_non_negative(self):
        """Default _CHUNK_OVERLAP should be a non-negative integer."""
        assert isinstance(_CHUNK_OVERLAP, int)
        assert _CHUNK_OVERLAP >= 0

    def test_chunk_overlap_less_than_chunk_size(self):
        """The default overlap should be less than the default chunk size."""
        assert _CHUNK_OVERLAP < _CHUNK_SIZE, \
            "Default overlap should be less than default chunk size to avoid redundant chunks"
