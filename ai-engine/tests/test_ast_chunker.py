import pytest
from services.ast_chunker import chunk_code


def test_python_ast_chunking():
    py_code = '''
def hello_world():
    print("Hello world")

class SampleClass:
    def method_one(self):
        pass
'''
    chunks = chunk_code("sample.py", py_code)
    assert len(chunks) > 0
    node_types = [c["metadata"]["node_type"] for c in chunks]
    assert "function_definition" in node_types or "class_definition" in node_types
    assert chunks[0]["metadata"]["chunker"] == "ast"


def test_javascript_ast_chunking():
    js_code = '''
function add(a, b) {
    return a + b;
}

class Calculator {
    multiply(a, b) {
        return a * b;
    }
}
'''
    chunks = chunk_code("calculator.js", js_code)
    assert len(chunks) > 0
    assert chunks[0]["metadata"]["chunker"] == "ast"


def test_unsupported_file_fallback():
    txt_content = "Line 1\nLine 2\nLine 3\nLine 4\n"
    chunks = chunk_code("readme.txt", txt_content)
    assert len(chunks) > 0
    assert chunks[0]["metadata"]["chunker"] == "fallback"


def test_empty_content():
    chunks = chunk_code("empty.py", "")
    assert chunks == []


def test_oversized_content():
    large_content = "a" * (11 * 1024 * 1024)
    chunks = chunk_code("large.py", large_content)
    assert chunks == []
