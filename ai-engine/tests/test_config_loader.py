import pytest

from config_loader import (
    CONFIG_FILENAME,
    CodeReviewerConfig,
    ConfigLoader,
    ConfigValidationError,
    parse_config_text,
    load_config_from_files,
)


class FakeFile:
    """Mimics the FileItem shape (name + content attributes) used by app.py."""
    def __init__(self, name, content):
        self.name = name
        self.content = content


SAMPLE_CONFIG_YAML = """
version: 1

rules:
  no-console:
    severity: off
  max-line-length:
    severity: info
    options:
      limit: 120

ignore_paths:
  - "vendor/**"
  - "dist/**"
  - "**/*.min.js"

languages:
  go:
    enabled: false
"""


class TestParseConfigText:
    def test_parses_valid_config(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.version == 1
        assert config.rules["no-console"]["severity"] == "off"
        assert config.rules["max-line-length"]["severity"] == "info"
        assert "vendor/**" in config.ignore_paths
        assert config.languages["go"]["enabled"] is False

    def test_empty_file_uses_all_defaults(self):
        config = parse_config_text("")
        assert config.version == 1
        assert config.rules == {}
        assert config.ignore_paths == []
        assert config.languages == {}

    def test_invalid_yaml_syntax_raises(self):
        with pytest.raises(ConfigValidationError, match="not valid YAML"):
            parse_config_text("rules: [unclosed")

    def test_non_mapping_top_level_raises(self):
        with pytest.raises(ConfigValidationError, match="top level"):
            parse_config_text("- just\n- a\n- list\n")

    def test_invalid_severity_value_raises_and_names_the_rule(self):
        bad_config = """
rules:
  no-console:
    severity: catastrophic
"""
        with pytest.raises(ConfigValidationError, match="no-console"):
            parse_config_text(bad_config)

    def test_rule_settings_must_be_a_mapping(self):
        bad_config = "rules:\n  no-console: off\n"
        with pytest.raises(ConfigValidationError, match="no-console"):
            parse_config_text(bad_config)

    def test_ignore_paths_must_be_a_list_of_strings(self):
        bad_config = "ignore_paths: not-a-list\n"
        with pytest.raises(ConfigValidationError, match="ignore_paths"):
            parse_config_text(bad_config)

    def test_languages_entry_must_be_a_mapping(self):
        bad_config = "languages:\n  go: disabled\n"
        with pytest.raises(ConfigValidationError, match="go"):
            parse_config_text(bad_config)

    def test_all_four_valid_severities_are_accepted(self):
        for severity in ("off", "info", "warning", "error"):
            config = parse_config_text(f"rules:\n  some-rule:\n    severity: {severity}\n")
            assert config.rules["some-rule"]["severity"] == severity


class TestCodeReviewerConfigLookups:
    def test_get_rule_severity_returns_configured_value(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.get_rule_severity("no-console") == "off"
        assert config.get_rule_severity("max-line-length") == "info"

    def test_get_rule_severity_falls_back_to_default_for_unmentioned_rule(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.get_rule_severity("totally-unmentioned-rule") == "error"
        assert config.get_rule_severity("totally-unmentioned-rule", default="warning") == "warning"

    def test_is_rule_off(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.is_rule_off("no-console") is True
        assert config.is_rule_off("max-line-length") is False
        assert config.is_rule_off("unmentioned-rule") is False

    def test_is_path_ignored_matches_glob_patterns(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.is_path_ignored("vendor/lib/foo.go") is True
        assert config.is_path_ignored("dist/bundle.js") is True
        assert config.is_path_ignored("static/js/app.min.js") is True
        assert config.is_path_ignored("src/main.go") is False

    def test_is_path_ignored_normalizes_windows_separators(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.is_path_ignored("vendor\\lib\\foo.go") is True

    def test_default_config_ignores_nothing(self):
        config = CodeReviewerConfig()
        assert config.is_path_ignored("anything/at/all.go") is False

    def test_is_language_enabled_respects_disabled_language(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.is_language_enabled("go") is False

    def test_is_language_enabled_defaults_true_for_unmentioned_language(self):
        config = parse_config_text(SAMPLE_CONFIG_YAML)
        assert config.is_language_enabled("python") is True
        assert config.is_language_enabled("javascript") is True

    def test_is_language_enabled_true_when_explicitly_set(self):
        config = parse_config_text("languages:\n  python:\n    enabled: true\n")
        assert config.is_language_enabled("python") is True


class TestConfigLoaderClass:
    def test_load_reads_and_parses_a_real_file(self, tmp_path):
        config_path = tmp_path / CONFIG_FILENAME
        config_path.write_text(SAMPLE_CONFIG_YAML)

        loader = ConfigLoader()
        config = loader.load(str(config_path))

        assert config.rules["no-console"]["severity"] == "off"
        assert loader.get_rule_severity("no-console") == "off"

    def test_loader_defaults_before_load_is_called(self):
        loader = ConfigLoader()
        assert loader.get_rule_severity("anything") == "error"

    def test_load_propagates_validation_errors(self, tmp_path):
        config_path = tmp_path / CONFIG_FILENAME
        config_path.write_text("rules:\n  bad:\n    severity: nonsense\n")

        loader = ConfigLoader()
        with pytest.raises(ConfigValidationError):
            loader.load(str(config_path))


class TestLoadConfigFromFiles:
    def test_finds_and_parses_config_among_other_files(self):
        files = [
            FakeFile("src/main.go", "package main"),
            FakeFile(CONFIG_FILENAME, SAMPLE_CONFIG_YAML),
            FakeFile("README.md", "# hi"),
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.rules["no-console"]["severity"] == "off"

    def test_returns_none_when_config_file_absent(self):
        files = [FakeFile("src/main.go", "package main")]
        assert load_config_from_files(files) is None

    def test_raises_when_present_config_is_invalid(self):
        files = [FakeFile(CONFIG_FILENAME, "rules:\n  x:\n    severity: bogus\n")]
        with pytest.raises(ConfigValidationError):
            load_config_from_files(files)

    def test_works_with_plain_dicts_not_just_objects(self):
        files = [
            {"name": CONFIG_FILENAME, "content": SAMPLE_CONFIG_YAML},
            {"name": "main.go", "content": "package main"},
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.is_language_enabled("go") is False

    def test_empty_file_list_returns_none(self):
        assert load_config_from_files([]) is None
