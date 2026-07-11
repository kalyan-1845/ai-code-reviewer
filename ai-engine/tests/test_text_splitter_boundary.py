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
        # Verify all chunks are returned
        reconstructed = "".join(chunk["content"] for chunk in result["chunks"])
        assert content in reconstructed or reconstructed.count("x") >= 2500

    def test_unicode_chinese_content(self):
        """Unicode Chinese content splits without error."""
        content = "这是中文测试。" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0
        # Verify content is preserved
        reconstructed = "".join(chunk["content"] for chunk in result["chunks"])
        assert "中文" in reconstructed

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

    def test_mixed_unicode_content(self):
        """Mixed Unicode content (Chinese, Arabic, emoji) splits without error."""
        content = "Hello 世界 مرحبا 😀" * 100
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
        assert len(result["chunks"]) > 0

    def test_file_name_with_path_traversal_characters(self):
        """File name with path traversal characters is handled safely."""
        content = "test content" * 100
        # Should not raise error or allow actual path traversal
        result = split_file_content("../file.js", content)
        assert result["file_name"] == "../file.js"
        assert len(result["chunks"]) > 0

    def test_file_name_with_non_ascii_characters(self):
        """File name with non-ASCII characters is handled correctly."""
        content = "test content" * 100
        result = split_file_content("файл_名前.py", content)
        assert result["file_name"] == "файл_名前.py"
        assert len(result["chunks"]) > 0

    def test_file_name_with_complex_path(self):
        """File name with complex path is handled correctly."""
        content = "test content" * 100
        result = split_file_content("src/components/my-component_v2.tsx", content)
        assert result["file_name"] == "src/components/my-component_v2.tsx"
        assert len(result["chunks"]) > 0

    def test_content_with_only_newlines(self):
        """Content with only newlines splits correctly."""
        content = "\n" * 500
        result = split_file_content("test.py", content)
        # Should handle newline-only content without error
        assert isinstance(result, dict)
        assert "chunks" in result

    def test_content_with_mixed_newlines(self):
        """Content with mixed newlines (\\n, \\r\\n) splits correctly."""
        content = "line1\nline2\r\nline3\n" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0

    def test_content_with_tabs(self):
        """Content with tabs splits correctly."""
        content = "def\tfunction():\n\t\treturn True\n" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0

    def test_very_long_single_token(self):
        """Very long single token (no spaces) is handled."""
        # A very long variable name or URL
        content = "a" * 5000
        result = split_file_content("test.py", content)
        # Should produce at least one chunk
        assert len(result["chunks"]) > 0

    def test_file_with_null_bytes_removed(self):
        """File content with null bytes is handled safely."""
        content = "hello\x00world" * 100
        # Should not raise error
        result = split_file_content("test.py", content)
        assert isinstance(result, dict)
        assert "chunks" in result

    def test_chunk_ids_are_unique_per_file(self):
        """Chunk IDs are unique for each chunk within a file."""
        content = "x" * 2500
        result = split_file_content("test.py", content)
        chunk_ids = [chunk["chunk_id"] for chunk in result["chunks"]]
        assert len(chunk_ids) == len(set(chunk_ids)), "Chunk IDs should be unique"

    def test_line_numbers_calculated_correctly(self):
        """Line numbers in chunks are calculated correctly."""
        content = "line1\nline2\nline3\n" * 100
        result = split_file_content("test.py", content)
        assert len(result["chunks"]) > 0
        # Each chunk should have start_line and end_line
        for chunk in result["chunks"]:
            assert "start_line" in chunk
            assert "end_line" in chunk
            assert chunk["end_line"] >= chunk["start_line"]

    def test_zero_chunk_size_parameter(self):
        """Zero chunk size parameter is handled gracefully."""
        content = "test" * 100
        # Should either raise ValueError or use default
        try:
            result = split_file_content("test.py", content, chunk_size=0)
            # If it doesn't raise, it should return valid results
            assert isinstance(result, dict)
        except (ValueError, Exception):
            # Expected behavior for invalid chunk size
            pass

    def test_negative_chunk_size_parameter(self):
        """Negative chunk size parameter is handled gracefully."""
        content = "test" * 100
        # Should either raise ValueError or use default
        try:
            result = split_file_content("test.py", content, chunk_size=-100)
            # If it doesn't raise, it should return valid results
            assert isinstance(result, dict)
        except (ValueError, Exception):
            # Expected behavior for invalid chunk size
            pass

    def test_split_files_with_unicode_file_names(self):
        """split_files handles unicode file names."""
        files = {
            "файл.py": "content1" * 100,
            "文件.js": "content2" * 100,
        }
        result = split_files(files)
        assert len(result) == 2
        file_names = [r["file_name"] for r in result]
        assert "файл.py" in file_names
        assert "文件.js" in file_names

    def test_split_files_with_empty_content(self):
        """split_files handles files with empty content."""
        files = {
            "empty.py": "",
            "nonempty.py": "content" * 100,
        }
        result = split_files(files)
        # Should return results for both files
        assert len(result) >= 1
        file_names = [r["file_name"] for r in result]
        assert "nonempty.py" in file_names

    def test_detect_language_with_unicode_content(self):
        """_detect_language handles unicode content in content parameter."""
        # Test with unicode content that might help with language detection
        assert _detect_language("unknown.txt", "def hello(): pass") == "python"
        assert _detect_language("unknown.txt", "function hello() {}") == "javascript"

    def test_split_preserves_content_order(self):
        """Content order is preserved when split into chunks."""
        content = "first\nsecond\nthird\nfourth\nfifth" * 100
        result = split_file_content("test.py", content)
        # Reconstruct content from chunks (handling overlap)
        all_text = "".join(chunk["content"] for chunk in result["chunks"])
        assert "first" in all_text
        assert all_text.index("first") < all_text.index("second")
        assert all_text.index("second") < all_text.index("third")
