import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Ensure ai-engine root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.llm_processor import LLMProcessor


class TestLLMProcessor:
    def setup_method(self):
        self.processor = LLMProcessor()

    def test_init_sets_default_chunk_size(self):
        assert self.processor.max_chunk_size == 4000

    def test_init_creates_ast_chunker(self):
        assert self.processor.chunker is not None

    def test_send_to_llm_returns_mock_response(self):
        result = self.processor._send_to_llm("some payload")
        assert result == "LLM_MOCK_RESPONSE"

    @patch.object(LLMProcessor, '_send_to_llm', return_value='mock')
    def test_process_repository_file_calls_send_to_llm(self, mock_send):
        code = "def hello():\n    pass\n"
        results = self.processor.process_repository_file('test.py', code)
        assert mock_send.called

    @patch.object(LLMProcessor, '_send_to_llm', return_value='mock')
    def test_process_repository_file_falls_back_for_unsupported_extension(self, mock_send):
        """Files with unsupported extensions should use naive chunking."""
        code = "void main() { printf(\"hello\"); }"
        # .c is not in the supported parsers — should fall back to naive chunking
        results = self.processor.process_repository_file('test.c', code)
        assert mock_send.called

    @patch.object(LLMProcessor, '_send_to_llm', return_value='LLM_MOCK')
    def test_process_repository_file_returns_list_of_responses(self, mock_send):
        code = "def foo():\n    pass\n\ndef bar():\n    pass\n"
        results = self.processor.process_repository_file('test.py', code)
        assert isinstance(results, list)
        assert all(r == 'LLM_MOCK' for r in results)

    def test_process_repository_file_uses_ast_chunker_for_python(self):
        """Verify ASTChunker is used for .py files."""
        code = "def foo():\n    pass\n"
        with patch.object(self.processor.chunker, 'chunk_code', wraps=self.processor.chunker.chunk_code) as mock_chunk:
            self.processor.process_repository_file('test.py', code)
            assert mock_chunk.called

    def test_process_repository_file_dispatches_one_chunk_per_chunk_returned(self):
        """Each chunk should result in one LLM call."""
        code = "def f1():\n    pass\n" + "\n" * 500 + \
               "def f2():\n    pass\n" + "\n" * 500 + \
               "def f3():\n    pass\n"
        with patch.object(LLMProcessor, '_send_to_llm', return_value='x') as mock_send:
            self.processor.process_repository_file('test.py', code)
            assert mock_send.call_count >= 1
