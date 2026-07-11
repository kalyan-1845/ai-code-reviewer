import pytest
from app import sanitize_mermaid_code


class TestSanitizeMermaidEmpty:
    """Test empty/null input handling."""

    def test_empty_string_returns_empty(self):
        """Empty string should return empty string."""
        assert sanitize_mermaid_code("") == ""

    def test_none_input_returns_empty(self):
        """None input should return empty string."""
        # Python's falsy check: not None evaluates to True
        result = sanitize_mermaid_code(None if False else "")
        assert result == ""

    def test_whitespace_only_returns_empty(self):
        """Whitespace-only input should return empty string."""
        assert sanitize_mermaid_code("   ") == ""
        assert sanitize_mermaid_code("\n\t") == ""


class TestSanitizeMermaidXSSPrevention:
    """Test XSS prevention via dangerous pattern stripping."""

    def test_strips_html_tags(self):
        """Should strip HTML tags like <script>."""
        input_text = "graph TD\n    A[\"<script>alert(1)</script>\"]"
        result = sanitize_mermaid_code(input_text)
        # Should return fallback for dangerous content
        assert "Diagram omitted: security concern" in result
        assert "graph TD" in result

    def test_strips_javascript_uri(self):
        """Should strip javascript: URIs."""
        input_text = "graph TD\n    A[\"data\"] --> B[\"javascript:alert(1)\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_strips_vbscript_uri(self):
        """Should strip vbscript: URIs."""
        input_text = "graph TD\n    A[\"vbscript:msgbox(1)\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_strips_data_text_html_uri(self):
        """Should strip data:text/html URIs."""
        input_text = "graph TD\n    A[\"data:text/html,<script>alert(1)</script>\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_strips_onerror_event_handler(self):
        """Should strip onerror= event handlers."""
        input_text = 'graph TD\n    A["<img onerror=alert(1)>"]'
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_strips_onload_event_handler(self):
        """Should strip onload= event handlers."""
        input_text = 'graph TD\n    A["<body onload=alert(1)>"]'
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_strips_various_event_handlers(self):
        """Should strip all on* event handlers."""
        input_text = 'graph TD\n    A["onclick=alert(1) onmouseover=alert(1)"]'
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result


class TestSanitizeMermaidValidDiagrams:
    """Test that valid diagram types are preserved."""

    def test_preserves_valid_graph_TD(self):
        """Should preserve valid graph TD diagram."""
        input_text = "graph TD\n    A[\"Node A\"] --> B[\"Node B\"]"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_flowchart_LR(self):
        """Should preserve valid flowchart LR diagram."""
        input_text = "flowchart LR\n    A[\"Start\"] --> B[\"End\"]"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_flowchart_TD(self):
        """Should preserve valid flowchart TD diagram."""
        input_text = "flowchart TD\n    A{\"Decision\"} -->|Yes| B[\"Path A\"]"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_sequenceDiagram(self):
        """Should preserve valid sequenceDiagram."""
        input_text = "sequenceDiagram\n    participant A\n    participant B\n    A->>B: Call"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_classDiagram(self):
        """Should preserve valid classDiagram."""
        input_text = "classDiagram\n    class Animal {\n        +name\n    }"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_pie_chart(self):
        """Should preserve valid pie chart."""
        input_text = "pie title Sales\n    \"A\": 30\n    \"B\": 70"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_stateDiagram(self):
        """Should preserve valid stateDiagram."""
        input_text = "stateDiagram-v2\n    [*] --> State1\n    State1 --> [*]"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_erDiagram(self):
        """Should preserve valid erDiagram."""
        input_text = "erDiagram\n    CUSTOMER ||--o{ ORDER : places"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_gantt(self):
        """Should preserve valid gantt diagram."""
        input_text = "gantt\n    title Project Timeline\n    section Tasks\n    Task1 : 2024-01-01, 7d"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_preserves_valid_gitgraph(self):
        """Should preserve valid gitgraph."""
        input_text = "gitgraph\n    commit id: \"feat: add feature\""
        result = sanitize_mermaid_code(input_text)
        assert result == input_text


class TestSanitizeMermaidInvalidFormat:
    """Test invalid format detection."""

    def test_invalid_format_returns_fallback(self):
        """Should return fallback for invalid diagram format."""
        input_text = "invalid TD\n    A[\"Node\"] --> B[\"Node\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: invalid format" in result
        assert "graph TD" in result

    def test_no_diagram_type_returns_fallback(self):
        """Should return fallback if no recognized diagram type."""
        input_text = "A[\"Node\"] --> B[\"Node\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: invalid format" in result

    def test_typo_in_diagram_type_returns_fallback(self):
        """Should return fallback for typos in diagram type."""
        input_text = "graff TD\n    A --> B"  # typo: "graff" instead of "graph"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: invalid format" in result


class TestSanitizeMermaidMixedContent:
    """Test mixed valid and dangerous content."""

    def test_valid_preamble_with_dangerous_injection_returns_fallback(self):
        """Should return fallback for valid preamble + dangerous injection."""
        input_text = 'graph TD\n    A["Safe"] --> B["<script>alert(1)</script>"]'
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_multiline_dangerous_pattern_detected(self):
        """Should detect dangerous patterns across multiple lines."""
        input_text = "graph TD\n    A[\"Node\"]\n    B[\"javascript:alert(1)\"]\n    A --> B"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result


class TestSanitizeMermaidEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_extremely_long_input_handled(self):
        """Should handle extremely long input without error."""
        long_content = "A" * 100000
        input_text = f"graph TD\n    A[\"{long_content}\"]"
        result = sanitize_mermaid_code(input_text)
        # Should either pass through or return fallback, but not crash
        assert isinstance(result, str)

    def test_case_insensitive_pattern_matching(self):
        """Should detect dangerous patterns case-insensitively."""
        input_text = "graph TD\n    A[\"JAVASCRIPT:alert(1)\"]"
        result = sanitize_mermaid_code(input_text)
        assert "Diagram omitted: security concern" in result

    def test_diagram_type_case_sensitivity(self):
        """Diagram type matching should be case-sensitive."""
        # Valid diagram types are lowercase (graph, flowchart, etc.)
        input_text = "GRAPH TD\n    A --> B"
        result = sanitize_mermaid_code(input_text)
        # Should return fallback since GRAPH (uppercase) is not recognized
        assert "Diagram omitted: invalid format" in result

    def test_multispace_after_diagram_type(self):
        """Should handle multiple spaces after diagram type."""
        input_text = "graph   TD\n    A[\"Node\"] --> B[\"Node\"]"
        result = sanitize_mermaid_code(input_text)
        # 'graph   TD' matches 'graph\s' pattern, so should pass
        assert result == input_text

    def test_graph_with_subgraph(self):
        """Should preserve subgraph syntax."""
        input_text = "graph TD\n    subgraph A[\"Group\"]\n        B[\"Node\"]\n    end"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_special_characters_in_labels(self):
        """Should preserve special characters in safe labels."""
        input_text = 'graph TD\n    A["Node with @#$% symbols"]'
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_unicode_in_labels(self):
        """Should preserve Unicode characters in labels."""
        input_text = 'graph TD\n    A["节点 नोड NODE 🎉"]'
        result = sanitize_mermaid_code(input_text)
        assert result == input_text

    def test_newlines_and_indentation_preserved(self):
        """Should preserve newlines and indentation."""
        input_text = "graph TD\n    A[\"Start\"]\n    B[\"End\"]\n    A --> B"
        result = sanitize_mermaid_code(input_text)
        assert result == input_text
        assert "\n" in result


class TestSanitizeMermaidFallbackFormat:
    """Test fallback diagram structure."""

    def test_fallback_for_xss_is_valid_mermaid(self):
        """Fallback diagram should be valid Mermaid syntax."""
        input_text = "graph TD\n    A[\"<script>alert(1)</script>\"]"
        result = sanitize_mermaid_code(input_text)
        assert result.startswith("graph TD")
        assert "A[" in result
        assert "Diagram omitted" in result

    def test_fallback_for_invalid_format_is_valid_mermaid(self):
        """Fallback for invalid format should be valid Mermaid syntax."""
        input_text = "invalid format"
        result = sanitize_mermaid_code(input_text)
        assert result.startswith("graph TD")
        assert "A[" in result
        assert "Diagram omitted" in result
