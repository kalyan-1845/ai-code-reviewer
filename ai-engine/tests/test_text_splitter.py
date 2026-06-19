import pytest
from text_splitter import (
    split_file_content,
    split_files,
    _detect_language,
    _generate_chunk_id,
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

    def test_detect_unknown_extension(self):
        assert _detect_language("readme.md") == "default"
        assert _detect_language("data.json") == "default"

    def test_detect_no_extension(self):
        assert _detect_language("Makefile") == "default"


class TestGenerateChunkId:
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
