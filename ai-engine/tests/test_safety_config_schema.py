"""
Schema validation tests for shared-safety-config.json.

This file is the SINGLE SOURCE OF TRUTH for homoglyph maps and dangerous phrases.
These tests validate the schema contract so that any future edits that break the
expected structure are caught by CI.
"""
import json
import os
import pytest


SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__), '..', '..', 'shared-safety-config.json'
)


def _load_config():
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


class TestSafetyConfigSchema:
    """Schema contract tests for shared-safety-config.json."""

    def test_file_is_valid_json(self):
        """The file must be parseable as JSON."""
        config = _load_config()
        assert isinstance(config, dict)

    def test_has_homoglyph_map_key(self):
        """Top-level key 'homoglyph_map' must be present."""
        config = _load_config()
        assert 'homoglyph_map' in config

    def test_has_dangerous_phrases_key(self):
        """Top-level key 'dangerous_phrases' must be present."""
        config = _load_config()
        assert 'dangerous_phrases' in config

    def test_homoglyph_map_is_a_dict(self):
        """homoglyph_map must be a dictionary."""
        config = _load_config()
        assert isinstance(config['homoglyph_map'], dict)

    def test_homoglyph_map_values_are_single_ascii_characters(self):
        """Every homoglyph_map value must be a single ASCII character."""
        config = _load_config()
        homoglyph_map = config['homoglyph_map']
        for key, value in homoglyph_map.items():
            assert isinstance(value, str), f'Value for key {repr(key)} must be a string, got {type(value).__name__}'
            assert len(value) == 1, f'Value for key {repr(key)} must be exactly 1 character, got {repr(value)}'
            assert value.isascii(), f'Value for key {repr(key)} must be ASCII, got {repr(value)}'

    def test_dangerous_phrases_is_a_list(self):
        """dangerous_phrases must be a list."""
        config = _load_config()
        assert isinstance(config['dangerous_phrases'], list)

    def test_dangerous_phrases_is_non_empty(self):
        """dangerous_phrases must contain at least one entry."""
        config = _load_config()
        assert len(config['dangerous_phrases']) > 0

    def test_dangerous_phrases_entries_are_non_empty_strings(self):
        """Each entry in dangerous_phrases must be a non-empty string."""
        config = _load_config()
        for i, phrase in enumerate(config['dangerous_phrases']):
            assert isinstance(phrase, str), f'Entry {i} must be a string, got {type(phrase).__name__}'
            assert len(phrase) > 0, f'Entry {i} must not be empty'
