import pytest
from utils.ast_chunker import ASTChunker


class TestASTChunkerInit:
    def test_init_creates_parsers_for_py_js_ts(self):
        chunker = ASTChunker()
        assert '.py' in chunker.parsers
        assert '.js' in chunker.parsers
        assert '.ts' in chunker.parsers

    def test_init_parsers_are_not_none(self):
        chunker = ASTChunker()
        assert chunker.parsers['.py'] is not None
        assert chunker.parsers['.js'] is not None
        assert chunker.parsers['.ts'] is not None


class TestGetParser:
    def test_get_parser_returns_parser_for_valid_extension(self):
        chunker = ASTChunker()
        parser_py = chunker.get_parser('.py')
        parser_js = chunker.get_parser('.js')
        parser_ts = chunker.get_parser('.ts')
        assert parser_py is not None
        assert parser_js is not None
        assert parser_ts is not None

    def test_get_parser_raises_for_unsupported_extension(self):
        chunker = ASTChunker()
        with pytest.raises(ValueError, match='Unsupported language extension'):
            chunker.get_parser('.go')

    def test_get_parser_raises_for_rust(self):
        chunker = ASTChunker()
        with pytest.raises(ValueError):
            chunker.get_parser('.rs')


class TestChunkCode:
    def test_chunk_code_returns_empty_list_for_empty_source(self):
        chunker = ASTChunker()
        chunks = chunker.chunk_code('', '.py')
        assert chunks == []

    def test_chunk_code_returns_single_chunk_when_source_fits(self):
        chunker = ASTChunker()
        source = 'def foo():\n    pass\n'
        chunks = chunker.chunk_code(source, '.py', max_chars=4000)
        assert len(chunks) == 1
        assert 'def foo()' in chunks[0]
        assert '# Chunk 1 of 1' in chunks[0]

    def test_chunk_code_includes_metadata_comment_for_python(self):
        chunker = ASTChunker()
        source = 'x = 1'
        chunks = chunker.chunk_code(source, '.py')
        assert '# Chunk 1 of 1' in chunks[0]

    def test_chunk_code_includes_metadata_comment_for_javascript(self):
        chunker = ASTChunker()
        source = 'const x = 1;'
        chunks = chunker.chunk_code(source, '.js')
        assert '// Chunk 1 of 1' in chunks[0]

    def test_chunk_code_respects_max_chars_boundary(self):
        chunker = ASTChunker()
        # Two large functions that exceed max_chars when combined
        large_func = 'def func():\n    ' + 'pass\n' * 500
        source = large_func + '\n' + large_func
        chunks = chunker.chunk_code(source, '.py', max_chars=4000)
        # Should produce at least 2 chunks
        assert len(chunks) >= 2

    def test_chunk_code_does_not_break_top_level_nodes(self):
        chunker = ASTChunker()
        source = 'def a(): pass\n\ndef b(): pass\n'
        chunks = chunker.chunk_code(source, '.py')
        # Each chunk should contain complete function definitions (not split mid-function)
        for chunk in chunks:
            # Check that chunk contains at least one complete top-level node
            assert 'def ' in chunk

    def test_chunk_code_formats_chunk_numbers_correctly(self):
        chunker = ASTChunker()
        # Create enough content to generate multiple chunks
        source = '\n'.join([f'def func{i}():\n    pass\n    x = {i}' * 5 for i in range(20)])
        chunks = chunker.chunk_code(source, '.py', max_chars=400)
        total = len(chunks)
        assert total >= 2
        # Check that chunk numbers are sequential
        for i, chunk in enumerate(chunks, 1):
            assert f'Chunk {i} of {total}' in chunk
