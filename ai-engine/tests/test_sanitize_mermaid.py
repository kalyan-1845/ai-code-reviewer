"""
Unit tests for sanitize_mermaid_code in ai-engine/app.py
"""
import pytest
from app import sanitize_mermaid_code

def test_empty_string():
    assert sanitize_mermaid_code("") == ""

def test_valid_graph_td():
    valid = "graph TD\n    A-->B;"
    assert sanitize_mermaid_code(valid) == valid

def test_valid_flowchart():
    valid = "flowchart LR\n    A-->B;"
    assert sanitize_mermaid_code(valid) == valid

def test_valid_sequence_diagram():
    valid = "sequenceDiagram\n    Alice->>Bob: Hello"
    assert sanitize_mermaid_code(valid) == valid

def test_html_tags_fallback():
    malicious = "graph TD\n    A[<script>alert(1)</script>]"
    expected = "graph TD\n    A[\"Diagram omitted: security concern\"]"
    assert sanitize_mermaid_code(malicious) == expected

def test_javascript_uri_fallback():
    malicious = "graph TD\n    click A javascript:alert(1)"
    expected = "graph TD\n    A[\"Diagram omitted: security concern\"]"
    assert sanitize_mermaid_code(malicious) == expected

def test_vbscript_uri_fallback():
    malicious = "graph TD\n    click A vbscript:msgbox(1)"
    expected = "graph TD\n    A[\"Diagram omitted: security concern\"]"
    assert sanitize_mermaid_code(malicious) == expected

def test_data_text_html_uri_fallback():
    malicious = "graph TD\n    click A data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="
    expected = "graph TD\n    A[\"Diagram omitted: security concern\"]"
    assert sanitize_mermaid_code(malicious) == expected

def test_on_event_handlers_fallback():
    malicious = "graph TD\n    A[\"click me\"] onclick=alert(1)"
    expected = "graph TD\n    A[\"Diagram omitted: security concern\"]"
    assert sanitize_mermaid_code(malicious) == expected

def test_invalid_diagram_type():
    invalid = "foo bar\n    A-->B;"
    expected = "graph TD\n    A[\"Diagram omitted: invalid format\"]"
    assert sanitize_mermaid_code(invalid) == expected

def test_valid_other_diagram_types():
    gantt = "gantt\n    title A Gantt Diagram\n    section Section\n    A task           :a1, 2014-01-01, 30d"
    pie = "pie\n    title Key elements in Product X\n    \"Dogs\" : 386\n    \"Cats\" : 85"
    assert sanitize_mermaid_code(gantt) == gantt
    assert sanitize_mermaid_code(pie) == pie
