import pytest
from fastapi.testclient import TestClient
import extractor
from app import app

client = TestClient(app)

def test_extractor_empty_content():
    """Verify that empty inputs return an empty list of chunks."""
    assert extractor.extract_chunks("app.py", "") == []
    assert extractor.extract_chunks("app.py", "   \n  ") == []
    assert extractor.extract_chunks("app.py", None) == []


def test_extractor_unsupported_language():
    """Verify that unsupported languages are ignored and return an empty list of chunks."""
    # .txt files are unsupported
    assert extractor.extract_chunks("notes.txt", "def hello():\n    pass") == []
    # .md files are unsupported
    assert extractor.extract_chunks("README.md", "# Hello World") == []


def test_extractor_python_ast():
    """Verify code chunk extraction and symbol resolution for Python using AST."""
    code = """# Python file sample
def top_level_func(a):
    return a + 1

class OuterClass:
    class_var = 123
    
    def method_one(self):
        def nested_in_method():
            pass
        return 1
        
    class InnerClass:
        def inner_method(self):
            pass
"""
    chunks = extractor.extract_chunks("sample.py", code)
    
    # Assert we extracted:
    # 1. top_level_func
    # 2. OuterClass
    # 3. OuterClass.method_one
    # 4. OuterClass.method_one.nested_in_method
    # 5. OuterClass.InnerClass
    # 6. OuterClass.InnerClass.inner_method
    
    symbols = [c["metadata"]["symbols"][0] for c in chunks]
    
    assert "top_level_func" in symbols
    assert "OuterClass" in symbols
    assert "OuterClass.method_one" in symbols
    assert "OuterClass.method_one.nested_in_method" in symbols
    assert "OuterClass.InnerClass" in symbols
    assert "OuterClass.InnerClass.inner_method" in symbols

    # Check start and end lines for top_level_func
    func_chunk = next(c for c in chunks if c["metadata"]["symbols"][0] == "top_level_func")
    assert func_chunk["metadata"]["start_line"] == 2
    assert func_chunk["metadata"]["end_line"] == 3
    assert "def top_level_func(a):" in func_chunk["content"]


def test_extractor_javascript():
    """Verify code chunk extraction, brace matching, and nesting for JavaScript/TypeScript."""
    code = """// JavaScript file sample
class Car {
    constructor(make) {
        this.make = make; // Comments with } should not break matching
        this.str = "string with } brace";
    }
    
    async start() {
        console.log(`starting ${this.make} now {`);
    }
}

function globalFunction() {
    const helper = () => {
        return true;
    };
}

const arrowFunc = (x) => {
    return x * x;
};

const anonFunc = function() {
    return 42;
};
"""
    chunks = extractor.extract_chunks("sample.js", code)
    symbols = [c["metadata"]["symbols"][0] for c in chunks]
    
    assert "Car" in symbols
    assert "Car.constructor" in symbols
    assert "Car.start" in symbols
    assert "globalFunction" in symbols
    assert "globalFunction.helper" in symbols
    assert "arrowFunc" in symbols
    assert "anonFunc" in symbols

    # Verify brace matching handled comments and string literals
    constructor_chunk = next(c for c in chunks if c["metadata"]["symbols"][0] == "Car.constructor")
    assert constructor_chunk["metadata"]["start_line"] == 3
    assert constructor_chunk["metadata"]["end_line"] == 6
    assert "this.make = make;" in constructor_chunk["content"]

    # Verify template literal braces handled correctly
    start_chunk = next(c for c in chunks if c["metadata"]["symbols"][0] == "Car.start")
    assert start_chunk["metadata"]["start_line"] == 8
    assert start_chunk["metadata"]["end_line"] == 10
    assert "console.log" in start_chunk["content"]


def test_extractor_java():
    """Verify code chunk extraction, constructors, methods, and enums for Java."""
    code = """package com.example;

public class Calculator {
    private int result;

    public Calculator() {
        this.result = 0;
    }

    public int add(int a, int b) {
        return a + b;
    }
}

interface Printable {
    void print(); // No body, should be ignored by brace matching
}

enum Status {
    ACTIVE,
    INACTIVE
}
"""
    chunks = extractor.extract_chunks("Calculator.java", code)
    symbols = [c["metadata"]["symbols"][0] for c in chunks]

    assert "Calculator" in symbols
    assert "Calculator.Calculator" in symbols  # Constructor
    assert "Calculator.add" in symbols
    assert "Status" in symbols
    assert "Printable" in symbols  # Interface itself has a body block
    assert "Printable.print" not in symbols  # print() has no body, ignored

    add_chunk = next(c for c in chunks if c["metadata"]["symbols"][0] == "Calculator.add")
    assert add_chunk["metadata"]["start_line"] == 10
    assert add_chunk["metadata"]["end_line"] == 12


def test_generate_chunk_id_deterministic():
    """Verify that generate_chunk_id produces a 16-character hex string."""
    chunk_id = extractor.generate_chunk_id("src/app.py", 0)
    assert len(chunk_id) == 16
    assert all(c in "0123456789abcdef" for c in chunk_id)

    # Same input must produce same output (deterministic)
    chunk_id2 = extractor.generate_chunk_id("src/app.py", 0)
    assert chunk_id == chunk_id2

    # Different index must produce different output
    chunk_id3 = extractor.generate_chunk_id("src/app.py", 1)
    assert chunk_id != chunk_id3

    # Different path must produce different output
    chunk_id4 = extractor.generate_chunk_id("src/utils.py", 0)
    assert chunk_id != chunk_id4


def test_find_matching_brace_simple():
    """Verify find_matching_brace finds the matching closing brace for simple blocks."""
    content = "function foo() { return 1; }"
    # Position right after the opening '{'
    pos = content.index('{') + 1
    end = extractor.find_matching_brace(content, pos)
    assert content[end] == '}'
    assert end == len(content) - 1  # trailing '}'


def test_find_matching_brace_nested():
    """Verify find_matching_brace handles nested braces correctly."""
    content = "function outer() { const x = 1; function inner() { return x; } return inner(); }"
    pos = content.index('{') + 1
    end = extractor.find_matching_brace(content, pos)
    assert content[end] == '}'


def test_find_matching_brace_with_comments():
    """Verify find_matching_brace ignores braces inside comments."""
    content = "// } this is a comment\nfunction foo() { return 1; }"
    pos = content.index('{') + 1
    end = extractor.find_matching_brace(content, pos)
    assert content[end] == '}'


def test_find_matching_brace_with_string_literals():
    """Verify find_matching_brace ignores braces inside string literals."""
    content = 'function foo() { const s = "} brace in string"; return s; }'
    pos = content.index('{') + 1
    end = extractor.find_matching_brace(content, pos)
    assert content[end] == '}'


def test_find_matching_brace_template_literal():
    """Verify find_matching_brace handles template literals with braces."""
    content = "function foo() { const s = `} brace in template`; return s; }"
    pos = content.index('{') + 1
    end = extractor.find_matching_brace(content, pos)
    assert content[end] == '}'


def test_api_extract_endpoint():
    """Verify endpoint routing and schemas via the FastAPI TestClient."""
    payload = {
        "files": [
            {
                "name": "math.py",
                "content": "def square(x):\n    return x * x\n"
            },
            {
                "name": "utils.js",
                "content": "function log(msg) {\n    console.log(msg);\n}\n"
            },
            {
                "name": "unsupported.txt",
                "content": "This file is ignored.\n"
            }
        ]
    }
    
    # Test POST /api/extract
    response = client.post("/api/extract", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "chunks" in data
    chunks = data["chunks"]
    
    # 1 py chunk + 1 js chunk = 2 chunks
    assert len(chunks) == 2
    
    # Verify metadata keys
    for chunk in chunks:
        assert "chunk_id" in chunk
        assert "content" in chunk
        assert "metadata" in chunk
        meta = chunk["metadata"]
        assert "file_path" in meta
        assert "language" in meta
        assert "start_line" in meta
        assert "end_line" in meta
        assert "symbols" in meta
        
    symbols = [c["metadata"]["symbols"][0] for c in chunks]
    assert "square" in symbols
    assert "log" in symbols

    # Test POST /extract (alias)
    response_alias = client.post("/extract", json=payload)
    assert response_alias.status_code == 200
    assert len(response_alias.json()["chunks"]) == 2
