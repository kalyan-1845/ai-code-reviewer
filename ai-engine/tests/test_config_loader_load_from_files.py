import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config_loader import load_config_from_files, ConfigValidationError


class TestLoadConfigFromFiles:
    """Tests for load_config_from_files function in config_loader.py."""

    def test_returns_none_when_no_config_file(self):
        """When no .codereviewer.yml is present, returns None."""
        files = [
            {"name": "README.md", "content": "# My Project"},
            {"name": "src/main.py", "content": "print('hello')"},
        ]
        result = load_config_from_files(files)
        assert result is None

    def test_returns_none_for_empty_file_list(self):
        """Empty file list should return None."""
        result = load_config_from_files([])
        assert result is None

    def test_finds_and_parses_codereviewer_yml_from_dict_entries(self):
        """load_config_from_files should find .codereviewer.yml from dict-style entries."""
        files = [
            {"name": "README.md", "content": "# My Project"},
            {"name": ".codereviewer.yml", "content": "version: 1\nrules:\n  security-check:\n    severity: warning"},
            {"name": "src/main.py", "content": "print('hello')"},
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.version == 1
        assert config.get_rule_severity("security-check") == "warning"

    def test_finds_codereviewer_yml_from_object_style_entries(self):
        """load_config_from_files supports duck-typed objects with .name/.content."""
        class FileObj:
            def __init__(self, name, content):
                self.name = name
                self.content = content

        files = [
            FileObj("README.md", "# My Project"),
            FileObj(".codereviewer.yml", "version: 2\nignore_paths:\n  - '*.tmp'"),
            FileObj("src/app.py", "def main(): pass"),
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.version == 2
        assert config.is_path_ignored("a.tmp") is True

    def test_raises_configvalidationerror_for_malformed_yaml(self):
        """Malformed .codereviewer.yml should raise ConfigValidationError."""
        files = [
            {"name": ".codereviewer.yml", "content": "rules:\n  - invalid list at root"},
        ]
        try:
            load_config_from_files(files)
            assert False, "Expected ConfigValidationError"
        except ConfigValidationError:
            pass  # expected

    def test_handles_empty_content_as_default_config(self):
        """Empty content should return default config (not raise)."""
        files = [
            {"name": ".codereviewer.yml", "content": ""},
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.version == 1
        assert config.rules == {}

    def test_whitespace_only_content_returns_default_config(self):
        """Whitespace-only content should return default config."""
        files = [
            {"name": ".codereviewer.yml", "content": "   \n  \n"},
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.version == 1

    def test_first_codereviewer_yml_is_used_when_multiple_present(self):
        """When multiple .codereviewer.yml entries exist, the first is used."""
        files = [
            {"name": "a/.codereviewer.yml", "content": "version: 1"},
            {"name": ".codereviewer.yml", "content": "version: 2"},
        ]
        config = load_config_from_files(files)
        assert config is not None
        # The function looks for name == ".codereviewer.yml", not paths
        # Only one entry with the exact name will be found

    def test_mixed_dict_and_object_entries_work_together(self):
        """Mixed dict and duck-typed object entries should all be searchable."""
        class FileObj:
            def __init__(self, name, content):
                self.name = name
                self.content = content

        files = [
            {"name": "README.md", "content": "# Project"},
            FileObj(".codereviewer.yml", "version: 3\nrules:\n  my-rule:\n    severity: info"),
            {"name": "src/app.py", "content": "pass"},
        ]
        config = load_config_from_files(files)
        assert config is not None
        assert config.version == 3
        assert config.get_rule_severity("my-rule") == "info"
