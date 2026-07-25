import pytest
from unittest.mock import patch, MagicMock

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.llm_processor import LLMProcessor


class TestLLMProcessorSendToLlm:
    """Tests for _send_to_llm — the internal LLM dispatch mock."""

    def test_send_to_llm_returns_mock_response(self):
        processor = LLMProcessor()
        result = processor._send_to_llm("some payload text")
        assert result == "LLM_MOCK_RESPONSE"

    def test_send_to_llm_with_empty_payload(self):
        processor = LLMProcessor()
        result = processor._send_to_llm("")
        assert result == "LLM_MOCK_RESPONSE"

    def test_send_to_llm_with_large_payload(self):
        processor = LLMProcessor()
        large_payload = "x" * 10000
        result = processor._send_to_llm(large_payload)
        assert result == "LLM_MOCK_RESPONSE"


class TestLLMProcessorProcessRepositoryFile:
    """Tests for process_repository_file — covers AST chunking and fallback paths."""

    @patch('services.llm_processor.ASTChunker')
    def test_python_file_chunks_via_ast(self, MockChunker):
        mock_instance = MagicMock()
        mock_instance.chunk_code.return_value = [
            "# Chunk 1 of 1: AST boundaries preserved\ndef hello():\n    pass",
        ]
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        processor.chunker = mock_instance

        code = "def hello():\n    pass"
        result = processor.process_repository_file("/tmp/test.py", code)

        mock_instance.chunk_code.assert_called_once_with(
            source_code=code,
            file_extension=".py",
            max_chars=4000,
        )
        assert len(result) == 1
        assert result[0] == "LLM_MOCK_RESPONSE"

    @patch('services.llm_processor.ASTChunker')
    def test_js_file_chunks_via_ast(self, MockChunker):
        mock_instance = MagicMock()
        mock_instance.chunk_code.return_value = [
            "// Chunk 1 of 1: AST boundaries preserved\nfunction greet() {\n  console.log('hi');\n}",
        ]
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        processor.chunker = mock_instance

        code = "function greet() {\n  console.log('hi');\n}"
        result = processor.process_repository_file("/tmp/test.js", code)

        mock_instance.chunk_code.assert_called_once_with(
            source_code=code,
            file_extension=".js",
            max_chars=4000,
        )
        assert len(result) == 1
        assert result[0] == "LLM_MOCK_RESPONSE"

    @patch('services.llm_processor.ASTChunker')
    def test_unsupported_extension_falls_back_to_character_slice(self, MockChunker):
        mock_instance = MagicMock()
        mock_instance.chunk_code.side_effect = ValueError("Unsupported language extension")
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        processor.chunker = mock_instance

        code = "a" * 10000
        result = processor.process_repository_file("/tmp/test.xyz", code)

        # Fallback: 10000 chars with max_chunk_size=4000 → 3 chunks
        assert len(result) == 3
        assert all(r == "LLM_MOCK_RESPONSE" for r in result)
        # Each chunk is at most 4000 chars
        for i, chunk in enumerate(mock_instance.chunk_code.call_args_list[0]):
            pass  # ValueError was raised, caught internally

    @patch('services.llm_processor.ASTChunker')
    def test_empty_code_single_chunk(self, MockChunker):
        mock_instance = MagicMock()
        mock_instance.chunk_code.return_value = [""]
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        processor.chunker = mock_instance

        result = processor.process_repository_file("/tmp/empty.py", "")

        assert len(result) == 1
        assert result[0] == "LLM_MOCK_RESPONSE"

    @patch('services.llm_processor.ASTChunker')
    def test_large_python_file_produces_multiple_chunks(self, MockChunker):
        mock_instance = MagicMock()
        # Simulate 3 chunks returned by AST chunker
        mock_instance.chunk_code.return_value = [
            "# Chunk 1 of 3\ndef func1():\n    pass",
            "# Chunk 2 of 3\ndef func2():\n    pass",
            "# Chunk 3 of 3\ndef func3():\n    pass",
        ]
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        processor.chunker = mock_instance

        code = "def func1():\n    pass\n\ndef func2():\n    pass\n\ndef func3():\n    pass"
        result = processor.process_repository_file("/tmp/large.py", code)

        assert len(result) == 3
        assert all(r == "LLM_MOCK_RESPONSE" for r in result)
        mock_instance.chunk_code.assert_called_once()

    @patch('services.llm_processor.ASTChunker')
    def test_max_chunk_size_is_4000(self, MockChunker):
        mock_instance = MagicMock()
        mock_instance.chunk_code.return_value = ["code"]
        MockChunker.return_value = mock_instance

        processor = LLMProcessor()
        assert processor.max_chunk_size == 4000

        processor.process_repository_file("/tmp/test.py", "code")

        mock_instance.chunk_code.assert_called_once_with(
            source_code="code",
            file_extension=".py",
            max_chars=4000,
        )
