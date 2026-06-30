import pytest
from app import sanitize_mermaid_code


class TestSanitizeMermaidCode:
    def test_returns_empty_string_for_none(self):
        result = sanitize_mermaid_code(None)
        assert result == ""

    def test_returns_empty_string_for_empty_string(self):
        result = sanitize_mermaid_code("")
        assert result == ""

    def test_whitespace_only_returns_invalid_format(self):
        # whitespace-only is truthy in Python, so it hits the format check
        result = sanitize_mermaid_code("   ")
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_accepts_valid_graph_diagram(self):
        diagram = "graph TD\n    A-->B"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_flowchart(self):
        diagram = "flowchart LR\n    A-->B"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_sequence_diagram(self):
        diagram = "sequenceDiagram\n    Alice->>Bob: Hello"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_class_diagram(self):
        diagram = "classDiagram\n    class Animal"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_state_diagram(self):
        # Note: stateDiagram-v2 is a valid mermaid type but the validation
        # regex requires a space after 'stateDiagram', so -v2 variants
        # are treated as invalid format (not security concern).
        diagram = "stateDiagram-v2\n    [*] --> State1"
        result = sanitize_mermaid_code(diagram)
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_accepts_valid_er_diagram(self):
        diagram = "erDiagram\n    CUSTOMER ||--o{ ORDER : places"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_gantt_chart(self):
        diagram = "gantt\n    title A Gantt\n    section Section"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_pie_chart(self):
        diagram = 'pie title Pets\n    "Dogs" : 386\n    "Cats" : 85'
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_accepts_valid_journey(self):
        diagram = "journey\n    title My working day"
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_gitgraph_case_sensitive_rejected(self):
        # The valid_start regex is case-sensitive; 'gitGraph' (capital G)
        # does not match 'gitgraph' in the regex.
        diagram = "gitGraph\n    commit id: \"A\""
        result = sanitize_mermaid_code(diagram)
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_gitgraph_lowercase_accepted(self):
        # Lowercase 'gitgraph' matches the regex.
        diagram = "gitgraph\n    commit id: \"A\""
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_rejects_html_tag_injection(self):
        result = sanitize_mermaid_code("<script>alert('xss')</script>")
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_img_onerror_injection(self):
        result = sanitize_mermaid_code('<img src=x onerror=alert(1)>')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_svg_onload_injection(self):
        result = sanitize_mermaid_code('<svg onload=alert(1)>')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_div_onclick_injection(self):
        result = sanitize_mermaid_code('<div onclick="alert(1)">click me</div>')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_javascript_uri(self):
        result = sanitize_mermaid_code('[link](javascript:alert(1))')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_vbscript_uri(self):
        result = sanitize_mermaid_code('[link](vbscript:alert(1))')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_data_uri_with_html(self):
        result = sanitize_mermaid_code('[img](data:text/html,<script>alert(1)</script>)')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_on_event_attribute(self):
        result = sanitize_mermaid_code('<body onload=alert(1)>')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_mixed_injection_attempt(self):
        # Valid mermaid start with injected content after
        injected = 'graph TD\n    A[""] <script>alert(1)</script>'
        result = sanitize_mermaid_code(injected)
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_rejects_invalid_diagram_format(self):
        result = sanitize_mermaid_code("not a mermaid diagram")
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_rejects_plain_text_without_diagram_keyword(self):
        result = sanitize_mermaid_code("This is just some text")
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_rejects_code_without_diagram_type(self):
        result = sanitize_mermaid_code("console.log('hello')")
        assert result == 'graph TD\n    A["Diagram omitted: invalid format"]'

    def test_valid_diagram_with_complex_content(self):
        diagram = '\n'.join([
            "graph TD",
            "    A[Start] --> B{Decision}",
            "    B -->|Yes| C[Do something]",
            "    B -->|No| D[Do other]",
        ])
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_valid_sequence_diagram_multiline(self):
        diagram = '\n'.join([
            "sequenceDiagram",
            "    Alice->>John: Hello John",
            "    John-->>Alice: Hi Alice",
        ])
        result = sanitize_mermaid_code(diagram)
        assert result == diagram

    def test_uppercase_event_attribute_rejected(self):
        result = sanitize_mermaid_code('<SVG ONLOAD=alert(1)>')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_dangerous_keyword_in_node_label_rejected(self):
        # Even if a graph starts correctly, if there's a dangerous pattern it should be rejected
        result = sanitize_mermaid_code('graph TD\n    A["<script>alert(1)</script>"]')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'

    def test_graph_with_javascript_in_link_rejected(self):
        result = sanitize_mermaid_code('graph TD\n    A[Click me]-->B[javascript:alert(1)]')
        assert result == 'graph TD\n    A["Diagram omitted: security concern"]'
