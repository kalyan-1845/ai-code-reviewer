import pytest
from text_splitter import (
    split_file_content,
    split_files,
    _detect_language,
    _generate_chunk_id,
    _make_splitter,
    _language_separators,
)


class TestLanguageDetection:
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

    def test_detect_csharp(self):
        assert _detect_language("app.cs") == "csharp"

    def test_detect_ruby(self):
        assert _detect_language("script.rb") == "ruby"

    def test_detect_swift(self):
        assert _detect_language("App.swift") == "swift"

    def test_detect_kotlin(self):
        assert _detect_language("main.kt") == "kotlin"
        assert _detect_language("script.kts") == "kotlin"

    def test_detect_php(self):
        assert _detect_language("index.php") == "php"

    def test_detect_unknown_extension(self):
        assert _detect_language("readme.md") == "default"
        assert _detect_language("data.json") == "default"

    def test_detect_no_extension(self):
        assert _detect_language("Makefile") == "default"


class TestGenerateChunkId:

    def test_different_files_produce_different_ids(self):
        cid1 = _generate_chunk_id("file_a.py", 0)
        cid2 = _generate_chunk_id("file_b.py", 0)
        assert cid1 != cid2

    def test_empty_filename_still_produces_id(self):
        cid = _generate_chunk_id("", 0)
        assert isinstance(cid, str)
        assert len(cid) == 16

    def test_whitespace_only_filename(self):
        cid = _generate_chunk_id("   ", 0)
        assert isinstance(cid, str)
        assert len(cid) == 16

    def test_same_file_different_indices_no_collision(self):
        ids = [_generate_chunk_id("file.py", i) for i in range(20)]
        assert len(ids) == len(set(ids)), "All chunk IDs for the same file should be unique"
    def test_chunk_id_format(self):
        cid = _generate_chunk_id("file.py", 0)
        assert isinstance(cid, str)
        assert len(cid) == 16

    def test_chunk_id_deterministic(self):
        cid1 = _generate_chunk_id("file.py", 0)
        cid2 = _generate_chunk_id("file.py", 0)
        assert cid1 == cid2

    def test_chunk_id_differs_by_index(self):
        cid1 = _generate_chunk_id("file.py", 0)
        cid2 = _generate_chunk_id("file.py", 1)
        assert cid1 != cid2


class TestSplitFileContent:
    def test_empty_content(self):
        result = split_file_content("empty.py", "")
        assert result == []

    def test_whitespace_only(self):
        result = split_file_content("space.py", "   \n  \n  ")
        assert result == []

    def test_small_file_no_split(self):
        content = "x = 1\ny = 2\nprint(x + y)"
        result = split_file_content("tiny.py", content)
        assert len(result) == 1
        assert result[0]["content"] == content
        assert result[0]["metadata"]["source_file"] == "tiny.py"
        assert result[0]["metadata"]["fileName"] == "tiny.py"
        assert result[0]["metadata"]["chunk_index"] == 0
        assert result[0]["metadata"]["total_chunks"] == 1
        assert result[0]["metadata"]["language"] == "python"
        assert result[0]["metadata"]["start_line"] == 0
        assert result[0]["metadata"]["end_line"] == 2
        assert "chunk_id" in result[0]

    def test_large_file_splits_into_multiple_chunks(self):
        content = "\n".join([f"print({i});" for i in range(500)])
        result = split_file_content("large.js", content, chunk_size=500)
        assert len(result) > 1
        assert result[0]["metadata"]["source_file"] == "large.js"
        assert result[0]["metadata"]["fileName"] == "large.js"
        assert result[0]["metadata"]["language"] == "javascript"
        assert result[0]["metadata"]["total_chunks"] == len(result)
        assert "start_line" in result[0]["metadata"]
        assert "end_line" in result[0]["metadata"]

    def test_chunk_overlap_produces_overlapping_content(self):
        content = "\n".join([f"line_{i}" for i in range(200)])
        no_overlap = split_file_content("overlap_test.py", content, chunk_size=500, chunk_overlap=0)
        with_overlap = split_file_content("overlap_test.py", content, chunk_size=500, chunk_overlap=100)
        assert len(with_overlap) >= len(no_overlap)

    def test_custom_chunk_size(self):
        content = "\n".join([f"item_{i}" for i in range(200)])
        result_small = split_file_content("custom.py", content, chunk_size=200)
        result_large = split_file_content("custom.py", content, chunk_size=2000)
        assert len(result_small) > len(result_large)

    def test_language_specific_separators_used(self):
        py_result = split_file_content("test.py", "\nclass Foo:\n    pass\ndef bar():\n    pass", chunk_size=50)
        md_result = split_file_content("readme.md", "\nclass Foo:\n    pass\ndef bar():\n    pass", chunk_size=50)
        assert py_result[0]["metadata"]["language"] == "python"
        assert md_result[0]["metadata"]["language"] == "default"

    def test_repo_url_in_metadata(self):
        content = "x = 1\ny = 2\nz = 3"
        result = split_file_content("test.py", content, repo_url="https://github.com/user/repo")
        assert len(result) == 1
        assert result[0]["metadata"]["repoUrl"] == "https://github.com/user/repo"
        assert result[0]["metadata"]["fileName"] == "test.py"
        assert result[0]["metadata"]["start_line"] == 0
        assert result[0]["metadata"]["end_line"] == 2


class TestSplitFiles:
    def test_multiple_files(self):
        files = [
            {"name": "a.py", "content": "x = 1"},
            {"name": "b.py", "content": "y = 2\ndef foo():\n    return y"},
        ]
        result = split_files(files)
        assert len(result) == 2
        assert result[0]["metadata"]["source_file"] == "a.py"
        assert result[0]["metadata"]["fileName"] == "a.py"
        assert result[1]["metadata"]["source_file"] == "b.py"
        assert result[1]["metadata"]["fileName"] == "b.py"

    def test_empty_files_list(self):
        result = split_files([])
        assert result == []

    def test_missing_keys_handled(self):
        files = [{"name": "a.py"}, {"content": "x = 1"}]
        result = split_files(files)
        assert len(result) == 0

    def test_repo_url_in_metadata(self):
        files = [{"name": "app.js", "content": "const x = 1;\nconst y = 2;",},]
        result = split_files(files, repo_url="https://github.com/user/repo")
        assert len(result) == 1
        assert result[0]["metadata"]["repoUrl"] == "https://github.com/user/repo"
        assert result[0]["metadata"]["fileName"] == "app.js"


class TestLanguageSeparators:
    def test_all_expected_languages_have_separators(self):
        expected_langs = ["python", "javascript", "typescript", "java",
                         "go", "rust", "cpp", "csharp", "ruby", "swift", "kotlin", "php", "default"]
        for lang in expected_langs:
            assert lang in _language_separators, f"Missing separators for {lang}"
            assert isinstance(_language_separators[lang], list)
            assert len(_language_separators[lang]) > 0

    def test_python_separators_include_function_keyword(self):
        seps = _language_separators["python"]
        assert "\nclass " in seps or "\n    " in seps
        assert "\ndef " in seps

    def test_javascript_separators_include_function_keywords(self):
        seps = _language_separators["javascript"]
        assert "\nclass " in seps or "\nfunction " in seps

    def test_default_separators_falls_back_to_paragraph_splits(self):
        seps = _language_separators["default"]
        assert isinstance(seps, list)
        assert len(seps) > 0


class TestMakeSplitter:
    def test_returns_recursive_character_text_splitter(self):
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        splitter = _make_splitter("test.py")
        assert isinstance(splitter, RecursiveCharacterTextSplitter)

    def test_uses_default_chunk_size_when_not_specified(self):
        splitter = _make_splitter("test.py")
        assert splitter._chunk_size == 1000
        assert splitter._chunk_overlap == 200

    def test_respects_custom_chunk_size(self):
        splitter = _make_splitter("test.py", chunk_size=500)
        assert splitter._chunk_size == 500

    def test_respects_custom_chunk_overlap(self):
        splitter = _make_splitter("test.py", chunk_overlap=50)
        assert splitter._chunk_overlap == 50

    def test_uses_python_separators_for_py_file(self):
        splitter = _make_splitter("test.py")
        expected_seps = _language_separators["python"]
        assert splitter._separators == expected_seps

    def test_uses_javascript_separators_for_js_file(self):
        splitter = _make_splitter("test.js")
        expected_seps = _language_separators["javascript"]
        assert splitter._separators == expected_seps

    def test_uses_java_separators_for_java_file(self):
        splitter = _make_splitter("Main.java")
        expected_seps = _language_separators["java"]
        assert splitter._separators == expected_seps

    def test_uses_go_separators_for_go_file(self):
        splitter = _make_splitter("main.go")
        expected_seps = _language_separators["go"]
        assert splitter._separators == expected_seps

    def test_uses_rust_separators_for_rs_file(self):
        splitter = _make_splitter("lib.rs")
        expected_seps = _language_separators["rust"]
        assert splitter._separators == expected_seps

    def test_uses_cpp_separators_for_cpp_file(self):
        splitter = _make_splitter("main.cpp")
        expected_seps = _language_separators["cpp"]
        assert splitter._separators == expected_seps

    def test_uses_csharp_separators(self):
        splitter = _make_splitter("app.cs")
        expected_seps = _language_separators["csharp"]
        assert splitter._separators == expected_seps

    def test_uses_ruby_separators(self):
        splitter = _make_splitter("script.rb")
        expected_seps = _language_separators["ruby"]
        assert splitter._separators == expected_seps

    def test_uses_swift_separators(self):
        splitter = _make_splitter("App.swift")
        expected_seps = _language_separators["swift"]
        assert splitter._separators == expected_seps

    def test_uses_kotlin_separators(self):
        splitter = _make_splitter("main.kt")
        expected_seps = _language_separators["kotlin"]
        assert splitter._separators == expected_seps

    def test_uses_php_separators(self):
        splitter = _make_splitter("index.php")
        expected_seps = _language_separators["php"]
        assert splitter._separators == expected_seps

    def test_uses_default_separators_for_unknown_extension(self):
        splitter = _make_splitter("readme.md")
        expected_seps = _language_separators["default"]
        assert splitter._separators == expected_seps

    def test_length_function_is_len(self):
        splitter = _make_splitter("test.py")
        assert splitter._length_function is len

    def test_detects_typescript_separators(self):
        splitter = _make_splitter("test.ts")
        expected_seps = _language_separators["typescript"]
        assert splitter._separators == expected_seps
