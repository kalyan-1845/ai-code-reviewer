"""Unit tests for ai-engine/config_loader.py settings and validation."""

import pytest
import yaml
from config_loader import (
    ConfigValidationError,
    CodeReviewerConfig,
    ConfigLoader,
    parse_config_text,
    load_config_from_files,
    CONFIG_FILENAME,
    VALID_SEVERITIES,
)


class TestCodeReviewerConfigDefaults:
    """Tests for CodeReviewerConfig default values."""

    def test_default_version_is_one(self):
        cfg = CodeReviewerConfig()
        assert cfg.version == 1

    def test_default_rules_is_empty_dict(self):
        cfg = CodeReviewerConfig()
        assert cfg.rules == {}
        assert isinstance(cfg.rules, dict)

    def test_default_ignore_paths_is_empty_list(self):
        cfg = CodeReviewerConfig()
        assert cfg.ignore_paths == []

    def test_default_languages_is_empty_dict(self):
        cfg = CodeReviewerConfig()
        assert cfg.languages == {}


class TestGetRuleSeverity:
    """Tests for get_rule_severity()"""

    def test_unknown_rule_returns_default(self):
        cfg = CodeReviewerConfig()
        assert cfg.get_rule_severity("nonexistent_rule") == "error"
        assert cfg.get_rule_severity("unknown", default="warning") == "warning"

    def test_known_rule_returns_configured_severity(self):
        cfg = CodeReviewerConfig(rules={"my_rule": {"severity": "warning"}})
        assert cfg.get_rule_severity("my_rule") == "warning"

    def test_rule_with_no_severity_returns_default(self):
        cfg = CodeReviewerConfig(rules={"my_rule": {"other_field": "value"}})
        assert cfg.get_rule_severity("my_rule") == "error"


class TestIsRuleOff:
    """Tests for is_rule_off()"""

    def test_explicitly_off_rule_returns_true(self):
        cfg = CodeReviewerConfig(rules={"audit_rule": {"severity": "off"}})
        assert cfg.is_rule_off("audit_rule") is True

    def test_error_rule_returns_false(self):
        cfg = CodeReviewerConfig(rules={"strict_rule": {"severity": "error"}})
        assert cfg.is_rule_off("strict_rule") is False

    def test_missing_rule_returns_false(self):
        cfg = CodeReviewerConfig()
        assert cfg.is_rule_off("missing") is False


class TestIsPathIgnored:
    """Tests for is_path_ignored()"""

    def test_glob_pattern_matches(self):
        cfg = CodeReviewerConfig(ignore_paths=["*.test.js", "dist/**"])
        assert cfg.is_path_ignored("foo.test.js") is True
        assert cfg.is_path_ignored("src/test.js") is False
        assert cfg.is_path_ignored("dist/index.js") is True

    def test_exact_path_matches(self):
        cfg = CodeReviewerConfig(ignore_paths=["node_modules"])
        assert cfg.is_path_ignored("node_modules") is True

    def test_empty_ignore_paths_returns_false(self):
        cfg = CodeReviewerConfig(ignore_paths=[])
        assert cfg.is_path_ignored("anything") is False

    def test_backslash_normalized_to_forward_slash(self):
        cfg = CodeReviewerConfig(ignore_paths=["src/**/*.test.js"])
        assert cfg.is_path_ignored("src\\components\\foo.test.js") is True


class TestIsLanguageEnabled:
    """Tests for is_language_enabled()"""

    def test_missing_language_defaults_to_enabled(self):
        cfg = CodeReviewerConfig()
        assert cfg.is_language_enabled("cobol") is True

    def test_explicitly_enabled_language(self):
        cfg = CodeReviewerConfig(languages={"rust": {"enabled": True}})
        assert cfg.is_language_enabled("rust") is True

    def test_explicitly_disabled_language(self):
        cfg = CodeReviewerConfig(languages={"assembly": {"enabled": False}})
        assert cfg.is_language_enabled("assembly") is False


class TestParseConfigText:
    """Tests for parse_config_text()"""

    def test_empty_text_returns_defaults(self):
        cfg = parse_config_text("")
        assert cfg.version == 1
        assert cfg.rules == {}

    def test_minimal_yaml_config(self):
        text = yaml.dump({"version": 2, "rules": {}, "ignore_paths": ["*.log"]})
        cfg = parse_config_text(text)
        assert cfg.version == 2
        assert cfg.ignore_paths == ["*.log"]

    def test_rules_parsed_correctly(self):
        text = yaml.dump({
            "rules": {
                "long_function": {"severity": "warning", "threshold": 50}
            }
        })
        cfg = parse_config_text(text)
        assert cfg.get_rule_severity("long_function") == "warning"

    def test_yaml_boolean_off_normalized_to_string(self):
        """YAML parses 'off' as boolean False, but we want the string 'off'."""
        text = "rules:\n  verbose_rule:\n    severity: off\n"
        cfg = parse_config_text(text)
        assert cfg.get_rule_severity("verbose_rule") == "off"
        assert isinstance(cfg.rules["verbose_rule"]["severity"], str)

    def test_invalid_severity_raises(self):
        text = yaml.dump({"rules": {"bad_rule": {"severity": "critical"}}})
        with pytest.raises(ConfigValidationError) as exc:
            parse_config_text(text)
        assert "Invalid severity" in str(exc.value)
        assert "critical" in str(exc.value)

    def test_non_mapping_rules_raises(self):
        text = yaml.dump({"rules": "not a mapping"})
        with pytest.raises(ConfigValidationError) as exc:
            parse_config_text(text)
        assert "rules" in str(exc.value)

    def test_non_mapping_ignore_paths_raises(self):
        text = yaml.dump({"ignore_paths": "should be list"})
        with pytest.raises(ConfigValidationError) as exc:
            parse_config_text(text)
        assert "ignore_paths" in str(exc.value)

    def test_non_mapping_languages_raises(self):
        text = yaml.dump({"languages": 42})
        with pytest.raises(ConfigValidationError) as exc:
            parse_config_text(text)
        assert "languages" in str(exc.value)

    def test_invalid_yaml_raises(self):
        with pytest.raises(ConfigValidationError) as exc:
            parse_config_text("{ invalid yaml: [")
        assert "not valid YAML" in str(exc.value)


class TestLoadConfigFromFiles:
    """Tests for load_config_from_files()"""

    def test_config_file_found_and_parsed(self):
        files = [
            {"name": "src/main.py", "content": "print('hello')"},
            {"name": ".codereviewer.yml", "content": "version: 3\nignore_paths:\n  - '*.tmp'\n"},
        ]
        cfg = load_config_from_files(files)
        assert cfg is not None
        assert cfg.version == 3
        assert cfg.ignore_paths == ["*.tmp"]

    def test_no_config_file_returns_none(self):
        files = [{"name": "README.md", "content": "# Hello"}]
        cfg = load_config_from_files(files)
        assert cfg is None

    def test_empty_file_list_returns_none(self):
        cfg = load_config_from_files([])
        assert cfg is None

    def test_malformed_config_raises(self):
        files = [{"name": ".codereviewer.yml", "content": "{ broken yaml ["}]
        with pytest.raises(ConfigValidationError):
            load_config_from_files(files)

    def test_object_style_files(self):
        class FakeFile:
            def __init__(self, name, content):
                self.name = name
                self.content = content
        files = [FakeFile(".codereviewer.yml", "ignore_paths:\n  - '*.swp'")]
        cfg = load_config_from_files(files)
        assert cfg is not None
        assert "*.swp" in cfg.ignore_paths
