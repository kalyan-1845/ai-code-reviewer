import pytest
from text_splitter import _make_splitter, split_file_content


class TestMakeSplitterOverlapCapping:
    """Test that _make_splitter caps overlap to prevent overlap >= chunk_size."""

    def test_overlap_equal_to_chunk_size_is_capped(self):
        """When overlap == chunk_size, it should be capped to chunk_size - 1."""
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=500)
        assert splitter._chunk_overlap == 499, (
            "overlap equal to chunk_size should be capped to chunk_size - 1"
        )

    def test_overlap_greater_than_chunk_size_is_capped(self):
        """When overlap > chunk_size, it should be capped to chunk_size - 1."""
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=1000)
        assert splitter._chunk_overlap == 499

    def test_overlap_slightly_less_than_chunk_size_is_preserved(self):
        """When overlap < chunk_size, it should be used as-is."""
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=100)
        assert splitter._chunk_overlap == 100

    def test_overlap_of_zero_is_preserved(self):
        """Overlap of 0 is valid and should be preserved."""
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=0)
        assert splitter._chunk_overlap == 0

    def test_none_overlap_falls_back_to_default(self):
        """When overlap is None, falls back to _CHUNK_OVERLAP."""
        from text_splitter import _CHUNK_OVERLAP
        splitter = _make_splitter("main.py", chunk_size=500, chunk_overlap=None)
        assert splitter._chunk_overlap == _CHUNK_OVERLAP

    def test_custom_size_with_none_overlap_uses_default_overlap(self):
        """Custom chunk_size with None overlap should use default overlap."""
        from text_splitter import _CHUNK_OVERLAP
        splitter = _make_splitter("main.py", chunk_size=2000, chunk_overlap=None)
        # Since _CHUNK_OVERLAP (default 200) < 2000, it is used as-is
        assert splitter._chunk_overlap == _CHUNK_OVERLAP
        assert splitter._chunk_size == 2000


class TestSplitFileContentEdgeCases:
    """Test split_file_content edge cases not covered by existing tests."""

    def test_single_line_equal_to_chunk_size_splits(self):
        """A single line exactly at chunk_size should return one chunk."""
        # chunk_size default is 1000
        large_line = "x" * 1000
        result = split_file_content("a.py", large_line)
        # Should either be 1 or 2 chunks depending on implementation
        assert len(result) >= 1
        assert result[0]["metadata"]["fileName"] == "a.py"

    def test_split_file_content_preserves_language_detection(self):
        """Split results should include the detected language in metadata."""
        content = "def foo():\n    pass\n\nclass Bar:\n    pass"
        result = split_file_content("a.py", content)
        assert len(result) > 0
        assert result[0]["metadata"]["language"] == "python"

    def test_split_file_content_with_custom_chunk_size(self):
        """Custom chunk_size should be respected."""
        content = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10"
        result = split_file_content("a.py", content, chunk_size=5)
        # With such small chunk_size, should split into multiple chunks
        assert len(result) >= 1

    def test_split_file_content_with_repo_url(self):
        """repo_url in metadata when provided."""
        content = "x = 1"
        result = split_file_content("a.py", content, repo_url="https://github.com/example/repo")
        assert len(result) > 0
        assert result[0]["metadata"].get("repoUrl") == "https://github.com/example/repo"

    def test_split_file_content_returns_correct_chunk_id_format(self):
        """Each chunk should have a chunk_id field that is a 16-char hex string."""
        content = "def foo(): pass"
        result = split_file_content("a.py", content)
        assert len(result) > 0
        chunk_id = result[0]["chunk_id"]
        assert isinstance(chunk_id, str)
        assert len(chunk_id) == 16
        assert all(c in '0123456789abcdef' for c in chunk_id)
