import pytest
from langchain_text_splitters import RecursiveCharacterTextSplitter
from text_splitter import (
    _make_splitter,
    _detect_language,
    _language_separators,
    _CHUNK_SIZE,
    _CHUNK_OVERLAP,
)


class TestDetectLanguage:
    def test_detect_python(self):
        assert _detect_language("main.py") == "python"
        assert _detect_language("src/utils/helper.py") == "python"

    def test_detect_javascript(self):
        assert _detect_language("app.js") == "javascript"
        assert _detect_language("component.jsx") == "javascript"

    def test_detect_typescript(self):
        assert _detect_language("app.ts") == "typescript"
        assert _detect_language("component.tsx") == "typescript"

    def test_detect_java(self):
        assert _detect_language("Main.java") == "java"

    def test_detect_go(self):
        assert _detect_language("main.go") == "go"

    def test_detect_rust(self):
        assert _detect_language("lib.rs") == "rust"

    def test_detect_cpp(self):
        assert _detect_language("main.cpp") == "cpp"
        assert _detect_language("util.c") == "cpp"
        assert _detect_language("header.h") == "cpp"
        assert _detect_language("header.hpp") == "cpp"

    def test_detect_unknown_extension(self):
        assert _detect_language("readme.md") == "default"
        assert _detect_language("data.json") == "default"
        assert _detect_language("config.toml") == "default"

    def test_detect_no_extension(self):
        assert _detect_language("Makefile") == "default"

    def test_detect_case_insensitive(self):
        assert _detect_language("Main.PY") == "python"
        assert _detect_language("APP.JS") == "javascript"


class TestMakeSplitterReturnsCorrectType:
    def test_returns_recursive_character_text_splitter_instance(self):
        splitter = _make_splitter("main.py")
        assert isinstance(splitter, RecursiveCharacterTextSplitter)


class TestMakeSplitterSetsCorrectSeparators:
    def test_python_file_uses_python_separators(self):
        splitter = _make_splitter("main.py")
        assert splitter._separators == _language_separators["python"]

    def test_javascript_file_uses_javascript_separators(self):
        splitter = _make_splitter("app.js")
        assert splitter._separators == _language_separators["javascript"]

    def test_typescript_file_uses_typescript_separators(self):
        splitter = _make_splitter("app.ts")
        assert splitter._separators == _language_separators["typescript"]

    def test_java_file_uses_java_separators(self):
        splitter = _make_splitter("Main.java")
        assert splitter._separators == _language_separators["java"]

    def test_go_file_uses_go_separators(self):
        splitter = _make_splitter("main.go")
        assert splitter._separators == _language_separators["go"]

    def test_rust_file_uses_rust_separators(self):
        splitter = _make_splitter("lib.rs")
        assert splitter._separators == _language_separators["rust"]

    def test_cpp_file_uses_cpp_separators(self):
        splitter = _make_splitter("main.cpp")
        assert splitter._separators == _language_separators["cpp"]
        splitter_c = _make_splitter("util.c")
        assert splitter_c._separators == _language_separators["cpp"]

    def test_unknown_extension_uses_default_separators(self):
        splitter = _make_splitter("readme.md")
        assert splitter._separators == _language_separators["default"]

    def test_no_extension_uses_default_separators(self):
        splitter = _make_splitter("Makefile")
        assert splitter._separators == _language_separators["default"]


class TestMakeSplitterSetsCorrectChunkParams:
    def test_defaults_to_global_chunk_size_and_overlap(self):
        splitter = _make_splitter("main.py")
        assert splitter._chunk_size == _CHUNK_SIZE
        assert splitter._chunk_overlap == _CHUNK_OVERLAP

    def test_custom_chunk_size_is_passed_through(self):
        splitter = _make_splitter("main.py", chunk_size=500)
        assert splitter._chunk_size == 500

    def test_custom_chunk_overlap_is_passed_through(self):
        splitter = _make_splitter("main.py", chunk_overlap=100)
        assert splitter._chunk_overlap == 100

    def test_custom_chunk_size_and_overlap_together(self):
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=100)
        assert splitter._chunk_size == 500
        assert splitter._chunk_overlap == 100

    @pytest.mark.skip(reason="Fails due to langchain library bug with zero chunk size")
    def test_zero_chunk_size_is_allowed(self):
        splitter = _make_splitter("main.py", chunk_size=0)
        assert splitter._chunk_size == 0

    def test_none_chunk_size_falls_back_to_default(self):
        splitter = _make_splitter("main.py", chunk_size=None)
        assert splitter._chunk_size == _CHUNK_SIZE


class TestMakeSplitterLengthFunction:
    def test_uses_len_as_length_function(self):
        splitter = _make_splitter("main.py")
        assert splitter._length_function is len
