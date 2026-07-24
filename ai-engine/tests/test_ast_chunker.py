import pytest
from utils.ast_chunker import ASTChunker


class TestASTChunker:
    """Unit tests for ASTChunker class."""

    def setup_method(self):
        self.chunker = ASTChunker()

    def test_get_parser_returns_parser_for_py(self):
        parser = self.chunker.get_parser('.py')
        assert parser is not None

    def test_get_parser_returns_parser_for_js(self):
        parser = self.chunker.get_parser('.js')
        assert parser is not None

    def test_get_parser_returns_parser_for_ts(self):
        parser = self.chunker.get_parser('.ts')
        assert parser is not None

    def test_get_parser_raises_valueerror_for_unsupported_language(self):
        with pytest.raises(ValueError) as exc:
            self.chunker.get_parser('.java')
        assert 'Unsupported language extension' in str(exc.value)

    def test_get_parser_raises_valueerror_for_go(self):
        with pytest.raises(ValueError) as exc:
            self.chunker.get_parser('.go')
        assert 'Unsupported language extension' in str(exc.value)

    def test_get_parser_raises_valueerror_for_cpp(self):
        with pytest.raises(ValueError) as exc:
            self.chunker.get_parser('.cpp')
        assert 'Unsupported language extension' in str(exc.value)

    def test_get_parser_raises_valueerror_for_markdown(self):
        with pytest.raises(ValueError) as exc:
            self.chunker.get_parser('.md')
        assert 'Unsupported language extension' in str(exc.value)

    def test_get_parser_raises_valueerror_for_unknown_extension(self):
        with pytest.raises(ValueError) as exc:
            self.chunker.get_parser('.xyz')
        assert 'Unsupported language extension' in str(exc.value)

    def test_chunk_code_single_function_within_max_chars_returns_one_chunk(self):
        source = '''def foo():
    return 42
'''
        chunks = self.chunker.chunk_code(source, '.py', max_chars=4000)
        assert len(chunks) == 1
        assert 'def foo():' in chunks[0]
        assert '# Chunk 1 of 1:' in chunks[0]

    def test_chunk_code_single_function_within_max_chars_has_python_comment_prefix(self):
        source = '''def bar():
    x = 1
'''
        chunks = self.chunker.chunk_code(source, '.py', max_chars=4000)
        assert '# Chunk 1 of 1:' in chunks[0]

    def test_chunk_code_multiple_small_declarations_packed_into_one_chunk(self):
        source = '''def foo(): return 1
def bar(): return 2
def baz(): return 3
'''
        chunks = self.chunker.chunk_code(source, '.py', max_chars=4000)
        assert len(chunks) == 1
        assert 'def foo():' in chunks[0]
        assert 'def bar():' in chunks[0]
        assert 'def baz():' in chunks[0]

    def test_chunk_code_respects_max_chars_splitting_across_chunks(self):
        # Create a source where each top-level declaration exceeds half max_chars
        large_func = 'def big():\n    ' + 'pass\n' * 500 + '\n'
        # Should split into multiple chunks
        chunks = self.chunker.chunk_code(large_func, '.py', max_chars=500)
        assert len(chunks) >= 2

    def test_chunk_code_adds_correct_metadata_headers_for_python(self):
        source = 'def foo(): pass\n'
        chunks = self.chunker.chunk_code(source, '.py', max_chars=4000)
        assert chunks[0].startswith('# Chunk 1 of 1:')

    def test_chunk_code_adds_correct_metadata_headers_for_javascript(self):
        source = 'function foo() {}\n'
        chunks = self.chunker.chunk_code(source, '.js', max_chars=4000)
        assert chunks[0].startswith('// Chunk 1 of 1:')

    def test_chunk_code_handles_empty_source_code(self):
        chunks = self.chunker.chunk_code('', '.py', max_chars=4000)
        assert chunks == []

    def test_chunk_code_handles_source_with_only_comments_python(self):
        source = '# just a comment\n# another comment\n'
        chunks = self.chunker.chunk_code(source, '.py', max_chars=4000)
        # Should not raise, returns chunks
        assert isinstance(chunks, list)

    def test_chunk_code_handles_source_with_only_comments_javascript(self):
        source = '// just a comment\n// another comment\n'
        chunks = self.chunker.chunk_code(source, '.js', max_chars=4000)
        assert isinstance(chunks, list)

    def test_chunk_code_chunk_count_reflects_total_number_of_chunks(self):
        # At least 2 chunks to verify count is accurate
        large_func = 'def big():\n    ' + 'pass\n' * 500 + '\n'
        chunks = self.chunker.chunk_code(large_func, '.py', max_chars=500)
        count_in_metadata = chunks[0].count('Chunk 1 of')
        assert chunks[0].startswith('# Chunk 1 of {}:'.format(len(chunks)))

    def test_chunk_code_multiple_chunks_have_sequential_chunk_numbers(self):
        large_func = 'def big():\n    ' + 'pass\n' * 500 + '\n'
        chunks = self.chunker.chunk_code(large_func, '.py', max_chars=500)
        if len(chunks) >= 2:
            assert '# Chunk 1 of {}:'.format(len(chunks)) in chunks[0]
            assert '# Chunk {} of {}:'.format(len(chunks), len(chunks)) in chunks[-1]
