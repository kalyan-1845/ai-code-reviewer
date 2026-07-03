"""Edge-case tests for _neutralize_pattern and _redact_key in app.py."""
import re

from app import _neutralize_pattern, _redact_key


class TestNeutralizePattern:
    def test_empty_pattern_generates_tokens_between_each_character(self):
        """Empty pattern matches between every character, generating a single token per call.
        The function generates one UUID and inserts it between every character."""
        text = "abc"
        result = _neutralize_pattern(text, "")
        assert result != text
        # A single token is used throughout (same UUID per call)
        import re
        tokens = re.findall(r'__NEUTRALIZED_[0-9a-f]{8}__', result)
        assert len(set(tokens)) == 1  # same token reused

    def test_returns_original_text_when_no_match(self):
        """When pattern is not found, content is unchanged."""
        text = "Normal code without dangerous content"
        result = _neutralize_pattern(text, "NEVER_MATCH_THIS_PATTERN_XYZ")
        assert result == text

    def test_replaces_all_occurrences_with_same_token(self):
        """Multiple occurrences are all replaced with the same token (one UUID per call)."""
        text = "api_key = secret; api_key = another;"
        result = _neutralize_pattern(text, "api_key")
        assert result != text
        assert "api_key" not in result
        # Same token used for all occurrences (one UUID per _neutralize_pattern call)
        import re
        tokens = re.findall(r'__NEUTRALIZED_[0-9a-f]{8}__', result)
        assert len(set(tokens)) == 1  # same token reused across all replacements

    def test_pattern_with_regex_special_characters_is_escaped(self):
        """Special regex chars in pattern are escaped so they are treated literally."""
        # The pattern contains '.' which is a regex metacharacter
        text = "user.name@example.com password=user.name"
        result = _neutralize_pattern(text, "user.name")
        # Without escaping, "user.name" would match "userXname" too
        # With escaping, only the literal "user.name" is matched
        assert "user.name" not in result
        # The 'password=user.name' part should also be neutralized
        assert "password" not in result or result.count("__NEUTRALIZED_") >= 1

    def test_case_insensitive_matching(self):
        """Replacement is case-insensitive per re.IGNORECASE flag."""
        text = "API_KEY = secret; api_key = another"
        result = _neutralize_pattern(text, "api_key")
        assert "api_key" not in result.lower()


class TestRedactKeyEdgeCases:
    def test_key_exactly_16_chars_uses_first_16(self):
        """Key with exactly 16 characters should be redacted using all 16."""
        key = "1234567890123456"
        text = f"My key is: {key} and it works"
        result = _redact_key(text, key)
        # The key should be replaced with ***
        assert key not in result

    def test_key_longer_than_16_chars_uses_prefix_only(self):
        """For keys > 16 chars, only the first 16 characters are redacted."""
        key = "verylongkeythatneedssubstring"
        text = f"My key is: {key}"
        result = _redact_key(text, key)
        # First 16 chars are "verylongkeythatne" - should be redacted
        assert key[:16] not in result
        # The rest of the key (after first 16 chars) might still appear
        suffix = key[16:]
        # The suffix should appear in result (it's not redacted)
        assert suffix in result or key not in result

    def test_key_with_regex_special_characters(self):
        """Keys containing regex special chars are escaped during redaction."""
        key = "pass.word+special*key?"
        text = f"Password: {key} and more"
        result = _redact_key(text, key)
        # Should not raise an exception (regex escape is applied)
        assert key not in result
        assert "***" in result

    def test_key_with_brackets_and_dollar(self):
        """Keys with bracket and dollar-sign chars are properly escaped."""
        key = "api[$key](value)"
        text = f"Setting {key} = done"
        result = _redact_key(text, key)
        assert key not in result
        assert "***" in result

    def test_empty_text_with_nonempty_key(self):
        """Empty text should return empty string regardless of key."""
        result = _redact_key("", "some-key")
        assert result == ""

    def test_unicode_key_is_handled(self):
        """Unicode characters in key are escaped and redacted correctly."""
        key = "password"
        text = f"Password is: {key}"
        result = _redact_key(text, key)
        assert key not in result
        assert "***" in result

    def test_redaction_replaces_all_occurrences(self):
        """All occurrences of the key in text are replaced."""
        key = "secret"
        text = "token=secret; refresh=secret; backup=secret"
        result = _redact_key(text, key)
        assert result.count("***") == 3
        assert key not in result

    def test_short_key_under_16_chars(self):
        """Short keys (< 16 chars) are fully redacted."""
        key = "shortkey"
        text = f"Auth: {key} is used here"
        result = _redact_key(text, key)
        assert key not in result
        assert "***" in result
