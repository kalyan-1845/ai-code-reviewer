import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config_loader import parse_config_text, ConfigValidationError


class TestParseConfigTextEdgeCases:
    """Tests for parse_config_text edge cases and validation paths."""

    def test_empty_string_returns_default_config(self):
        """Empty string input should return a default CodeReviewerConfig."""
        config = parse_config_text("")
        assert config.version == 1
        assert config.rules == {}
        assert config.ignore_paths == []
        assert config.languages == {}

    def test_whitespace_only_yaml_returns_default_config(self):
        """YAML document with only whitespace should return default config."""
        config = parse_config_text("   \n\n    \n")
        assert config.version == 1
        assert config.rules == {}

    def test_malformed_yaml_syntax_raises_validation_error(self):
        """Malformed YAML syntax should raise ConfigValidationError."""
        # A colon at root level without a key is invalid YAML
        malformed_yaml = ":\n  rules: value"
        try:
            parse_config_text(malformed_yaml)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "not valid YAML" in str(e)

    def test_ignore_paths_blocking_critical_file_dotgithub_raises_error(self):
        """ignore_paths containing '.github' should be rejected."""
        yaml_content = """
ignore_paths:
  - .github
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert ".github" in str(e) or "critical" in str(e).lower()

    def test_ignore_paths_blocking_github_workflows_raises_error(self):
        """ignore_paths containing '.github/workflows' should be rejected."""
        yaml_content = """
ignore_paths:
  - .github/workflows/
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert ".github" in str(e).lower()

    def test_ignore_paths_blocking_requirements_txt_raises_error(self):
        """ignore_paths containing 'requirements.txt' should be rejected."""
        yaml_content = """
ignore_paths:
  - requirements.txt
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "requirements.txt" in str(e)

    def test_ignore_paths_blocking_package_json_raises_error(self):
        """ignore_paths containing 'package.json' should be rejected."""
        yaml_content = """
ignore_paths:
  - package.json
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "package.json" in str(e)

    def test_ignore_paths_case_insensitive_blocking_raises_error(self):
        """Ignore path matching is case-insensitive for critical files."""
        yaml_content = """
ignore_paths:
  - .GITHUB
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError:
            pass  # expected

    def test_languages_with_null_entry_raises_validation_error(self):
        """Language entries with null value should raise ConfigValidationError."""
        yaml_content = """
languages:
  python: null
  javascript: ~
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "Language entry" in str(e) and ("python" in str(e) or "javascript" in str(e))

    def test_languages_with_empty_object_entry_is_tolerated(self):
        """Language entries with empty object {} should be tolerated."""
        yaml_content = """
languages:
  rust: {}
  go: {}
"""
        config = parse_config_text(yaml_content)
        assert isinstance(config.languages, dict)
        # Empty object should be treated as default (enabled: True)
        assert config.is_language_enabled("rust") is True
        assert config.is_language_enabled("go") is True

    def test_invalid_severity_value_raises_validation_error(self):
        """Invalid severity value should raise ConfigValidationError."""
        yaml_content = """
rules:
  security-check:
    severity: CRITICAL
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "CRITICAL" in str(e) or "severity" in str(e).lower()

    def test_top_level_string_raises_validation_error(self):
        """Top-level YAML string (not a mapping) should raise ConfigValidationError."""
        try:
            parse_config_text("just a plain string")
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "mapping" in str(e).lower()

    def test_rules_is_not_a_dict_raises_validation_error(self):
        """rules key with non-dict value should raise ConfigValidationError."""
        yaml_content = """
rules: "not a dict"
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "rules" in str(e).lower()

    def test_ignore_paths_is_not_a_list_raises_validation_error(self):
        """ignore_paths key with non-list value should raise ConfigValidationError."""
        yaml_content = """
ignore_paths: "/**.py"
"""
        try:
            parse_config_text(yaml_content)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError as e:
            assert "ignore_paths" in str(e).lower() or "list" in str(e).lower()

    def test_rule_with_boolean_true_severity_normalized_to_error(self):
        """Rule with severity: true should be normalized to 'error'."""
        yaml_content = """
rules:
  no-print:
    severity: true
"""
        config = parse_config_text(yaml_content)
        assert config.get_rule_severity("no-print") == "error"

    def test_rule_with_boolean_false_severity_normalized_to_off(self):
        """Rule with severity: false should be normalized to 'off'."""
        yaml_content = """
rules:
  no-print:
    severity: false
"""
        config = parse_config_text(yaml_content)
        assert config.get_rule_severity("no-print") == "off"
