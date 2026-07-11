import pytest
from text_splitter import split_file_content, split_files, _detect_language


class TestSplitFileContentBoundaries:
    """Test boundary conditions and edge cases for split_file_content."""

    def test_empty_file_content_returns_empty_chunks(self):
        """Empty file should return empty chunks list."""
        result = split_file_content("test.py", "")
        assert result["chunks"] == []
        assert result["file_name"] == "test.py"

    def test_single_line_shorter_than_chunk_size(self):
        """Single-line file shorter than chunk size returns one chunk."""
        content = "print('hello world')"
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) == 1
        assert result["chunks"][0]["content"] == content

    def test_single_line_equal_to_chunk_size(self):
        """Single-line file equal to chunk size returns one chunk."""
        content = "x" * 1000  # Default chunk size is 1000
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) == 1

    def test_single_line_longer_than_chunk_size(self):
        """Single-line file longer than chunk size returns multiple chunks."""
        content = "x" * 2500
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 1

    def test_unicode_chinese_content(self):
        """Unicode Chinese content splits without error."""
        content = "这是中文测试。" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0

    def test_unicode_arabic_content(self):
        """Unicode Arabic content splits without error."""
        content = "هذا نص عربي للاختبار。" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0

    def test_emoji_only_content(self):
        """Emoji-only content splits without error."""
        content = "😀🎉🚀💻" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0

    def test_file_name_with_spaces(self):
        """File name with spaces is handled correctly."""
        content = "test content" * 100
        result = split_file_content("my file.js", content)
        assert result["file_name"] == "my file.js"
        assert len(result["chunks"]) > 0

    def test_file_name_with_special_characters(self):
        """File name with special characters is handled correctly."""
        content = "test content" * 100
        result = split_file_content("my-file_name.js", content)
        assert result["file_name"] == "my-file_name.js"

    def test_file_name_with_path_traversal_characters(self):
        """File name with path traversal characters is handled safely."""
        content = "test content" * 100
        result = split_file_content("../file.js", content)
        assert result["file_name"] == "../file.js"

    def test_file_name_with_non_ascii_characters(self):
        """File name with non-ASCII characters is handled correctly."""
        content = "test content" * 100
        result = split_file_content("файл_名前.py", content)
        assert result["file_name"] == "файл_名前.py"

    def test_content_with_only_newlines(self):
        """Content with only newlines splits correctly."""
        content = "\n" * 500
        result = split_file_content("test.py", content)
        assert isinstance(result, dict)
        assert "chunks" in result

    def test_chunk_ids_are_unique_per_file(self):
        """Chunk IDs are unique for each chunk within a file."""
        content = "x" * 2500
        result = split_file_content("test.py", content)
        chunk_ids = [chunk["chunk_id"] for chunk in result["chunks"]]
        assert len(chunk_ids) == len(set(chunk_ids))

    def test_line_numbers_calculated_correctly(self):
        """Line numbers in chunks are calculated correctly."""
        content = "line1\nline2\nline3\n" * 100
        result = split_file_content("test.py", content)
        for chunk in result["chunks"]:
            assert "start_line" in chunk
            assert "end_line" in chunk
            assert chunk["end_line"] >= chunk["start_line"]

    def test_split_files_with_unicode_file_names(self):
        """split_files handles unicode file names."""
        files = {
            "файл.py": "content1" * 100,
            "文件.js": "content2" * 100,
        }
        result = split_files(files)
        assert len(result) == 2
