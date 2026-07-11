import pytest
from text_splitter import _calculate_line_numbers


class TestCalculateLineNumbers:
    """Tests for _calculate_line_numbers function in text_splitter.py."""

    def test_empty_content_with_single_empty_chunk(self):
        """Empty content with empty chunk starting at 0."""
        result = _calculate_line_numbers("", [""], [0])
        assert result == [(0, 0)]

    def test_single_line_no_newlines(self):
        """Single line content, one chunk starting at index 0."""
        content = "hello world"
        chunks = ["hello world"]
        result = _calculate_line_numbers(content, chunks, [0])
        assert result == [(0, 0)]

    def test_single_line_with_offset(self):
        """Single line chunk starting at a non-zero offset."""
        content = "prefix hello world"
        chunks = ["hello world"]
        # start_idx=7 (after "prefix ")
        result = _calculate_line_numbers(content, chunks, [7])
        assert result == [(0, 0)]  # no newlines in prefix, no newlines in chunk

    def test_multiple_newlines_in_single_chunk(self):
        """Chunk with multiple lines has correct end_line."""
        content = "line1\nline2\nline3"
        chunks = ["line1\nline2\nline3"]
        result = _calculate_line_numbers(content, chunks, [0])
        # 0 newlines before index 0, 2 newlines in chunk
        assert result == [(0, 2)]

    def test_multiple_chunks_sequential(self):
        """Multiple chunks with sequential start indices."""
        content = "line1\nline2\nline3\nline4\nline5"
        chunks = ["line1\nline2", "line3\nline4\nline5"]
        result = _calculate_line_numbers(content, chunks, [0, 8])
        # Chunk 1: 0 newlines before 0, 1 newline in "line1\nline2" -> (0, 1)
        # Chunk 2: 1 newline before index 8, 2 newlines in "line3\nline4\nline5" -> (1, 3)
        assert result == [(0, 1), (1, 3)]

    def test_end_line_always_gte_start_line(self):
        """End line number should always be >= start line number."""
        content = "a\nb\nc\nd\ne\nf\ng\nh"
        chunks = ["a\nb", "c\nd\ne", "f\ng\nh"]
        start_indices = [0, 4, 10]
        result = _calculate_line_numbers(content, chunks, start_indices)
        for start, end in result:
            assert end >= start

    def test_first_chunk_starts_at_zero(self):
        """First chunk starting at index 0 should start at line 0."""
        content = "first line\nsecond line\nthird line"
        chunks = ["first line"]
        result = _calculate_line_numbers(content, chunks, [0])
        assert result[0][0] == 0

    def test_single_character_content(self):
        """Single character content."""
        result = _calculate_line_numbers("a", ["a"], [0])
        assert result == [(0, 0)]

    def test_number_of_tuples_equals_number_of_chunks(self):
        """Output list length should match input chunks length."""
        content = "a\nb\nc\nd\ne"
        chunks = ["a", "b", "c", "d", "e"]
        start_indices = [0, 2, 4, 6, 8]
        result = _calculate_line_numbers(content, chunks, start_indices)
        assert len(result) == len(chunks)

    def test_overlapping_chunks_with_overlap(self):
        """Chunks with overlap (e.g., last line repeated)."""
        content = "line1\nline2\nline3"
        # Two chunks that overlap by one line
        chunks = ["line1\nline2", "line2\nline3"]
        result = _calculate_line_numbers(content, chunks, [0, 7])
        # Chunk 1: 0 newlines before 0, 1 newline in chunk -> (0, 1)
        # Chunk 2: 1 newline before 7 (the \n at index 5), 1 newline in chunk -> (1, 2)
        assert result[0] == (0, 1)
        assert result[1] == (1, 2)

    def test_large_file_with_many_lines(self):
        """Large file with many lines."""
        lines = ["line" + str(i) for i in range(1000)]
        content = "\n".join(lines)
        chunk_size = 100
        chunks = [content[i:i+chunk_size] for i in range(0, len(content), chunk_size)]
        start_indices = list(range(0, len(content), chunk_size))
        # Only test first few to keep test fast
        result = _calculate_line_numbers(
            content, chunks[:5], start_indices[:5]
        )
        assert len(result) == 5
        assert result[0][0] == 0  # first chunk starts at line 0
        assert result[1][0] > result[0][0]  # second chunk starts later

    def test_preserves_chunk_count_even_with_extra_indices(self):
        """zip truncates to shortest list."""
        content = "a\nb\nc"
        chunks = ["a\nb"]
        start_indices = [0, 10]  # one extra
        result = _calculate_line_numbers(content, chunks, start_indices)
        assert len(result) == 1  # zip truncates
        assert result[0] == (0, 1)
