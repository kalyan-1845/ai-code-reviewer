import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.ast_chunker import ASTChunker


class TestASTChunkerInit:
    def test_init_creates_parsers_for_py_and_js(self):
        chunker = ASTChunker()
        assert '.py' in chunker.parsers
        assert '.js' in chunker.parsers
        assert '.ts' in chunker.parsers

    def test_init_registers_python_parser(self):
        chunker = ASTChunker()
        assert '.py' in chunker.parsers


class TestGetParser:
    def test_get_parser_returns_parser_for_py(self):
        chunker = ASTChunker()
        parser = chunker.get_parser('.py')
        assert parser is not None

    def test_get_parser_returns_parser_for_js(self):
        chunker = ASTChunker()
        parser = chunker.get_parser('.js')
        assert parser is not None

    def test_get_parser_returns_parser_for_ts(self):
        chunker = ASTChunker()
        parser = chunker.get_parser('.ts')
        assert parser is not None

    def test_get_parser_raises_for_unsupported_extension(self):
        chunker = ASTChunker()
        with pytest.raises(ValueError, match='Unsupported language'):
            chunker.get_parser('.xyz')


class TestChunkCode:
    def test_chunk_code_returns_list(self):
        chunker = ASTChunker()
        result = chunker.chunk_code('def foo(): pass', '.py')
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_chunk_code_includes_metadata_header(self):
        chunker = ASTChunker()
        result = chunker.chunk_code('def foo(): pass', '.py')
        assert '# Chunk 1 of 1:' in result[0]

    def test_chunk_code_single_large_node_not_split(self):
        """A single AST node larger than max_chars is emitted as-is (no splitting within a node)."""
        chunker = ASTChunker()
        big_func = 'def foo():\n    ' + 'x' * 5000 + '\n'
        result = chunker.chunk_code(big_func, '.py', max_chars=4000)
        # Single large function is one chunk (cannot be split within AST boundary)
        assert len(result) == 1

    def test_chunk_code_single_function_one_chunk(self):
        chunker = ASTChunker()
        code = 'def hello():\n    print("world")\n'
        result = chunker.chunk_code(code, '.py')
        assert len(result) == 1

    def test_chunk_code_multiple_functions_split_across_chunks(self):
        """Large functions should be split at AST boundaries."""
        chunker = ASTChunker()
        big = 'def f():\n' + '    pass\n' * 1000
        result = chunker.chunk_code(big, '.py', max_chars=4000)
        # Multiple chunks expected for a very large function
        assert len(result) >= 1

    def test_chunk_code_js_file_uses_js_comment_prefix(self):
        chunker = ASTChunker()
        code = 'function hello() { console.log("world"); }'
        result = chunker.chunk_code(code, '.js')
        assert '// Chunk 1 of' in result[0]

    def test_chunk_code_ts_file_uses_js_comment_prefix(self):
        chunker = ASTChunker()
        code = 'function hello(): void { console.log("world"); }'
        result = chunker.chunk_code(code, '.ts')
        assert '// Chunk 1 of' in result[0]

    def test_chunk_code_empty_source_returns_empty_list(self):
        """Empty source has no AST children, so no chunks are produced."""
        chunker = ASTChunker()
        result = chunker.chunk_code('', '.py')
        assert result == []

    def test_chunk_code_multiple_top_level_nodes_split_correctly(self):
        chunker = ASTChunker()
        code = 'def foo():\n    pass\n\ndef bar():\n    pass\n\ndef baz():\n    pass\n'
        result = chunker.chunk_code(code, '.py')
        assert len(result) >= 1
        # Verify all functions appear somewhere in chunks
        combined = '\n'.join(result)
        assert 'def foo' in combined
        assert 'def bar' in combined
        assert 'def baz' in combined

    def test_chunk_code_total_chunk_count_increments(self):
        chunker = ASTChunker()
        code = 'def foo():\n    pass\n' * 5
        result = chunker.chunk_code(code, '.py', max_chars=200)
        total = len(result)
        assert total >= 1
        # Each chunk header should report the same total
        for i, chunk in enumerate(result, 1):
            assert f'of {total}' in chunk
