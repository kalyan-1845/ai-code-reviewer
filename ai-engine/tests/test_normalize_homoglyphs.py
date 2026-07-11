import pytest
from app import normalize_homoglyphs


class TestNormalizeHomoglyphs:
    def test_known_homoglyphs_are_normalized(self):
        # Cyrillic letters that look like Latin a, e, o, c, p
        assert normalize_homoglyphs('\u0430') == 'a'   # Cyrillic а
        assert normalize_homoglyphs('\u0435') == 'e'   # Cyrillic е
        assert normalize_homoglyphs('\u043e') == 'o'   # Cyrillic о
        assert normalize_homoglyphs('\u0441') == 'c'   # Cyrillic с
        assert normalize_homoglyphs('\u0440') == 'p'   # Cyrillic р
        assert normalize_homoglyphs('\u0445') == 'x'   # Cyrillic х
        assert normalize_homoglyphs('\u0443') == 'y'  # Cyrillic у
        assert normalize_homoglyphs('\u0432') == 'b'  # Cyrillic в
        assert normalize_homoglyphs('\u043d') == 'h'  # Cyrillic н
        assert normalize_homoglyphs('\u043a') == 'k'  # Cyrillic к
        assert normalize_homoglyphs('\u043c') == 'm'  # Cyrillic м
        assert normalize_homoglyphs('\u0438') == 'i'  # Cyrillic и
        assert normalize_homoglyphs('\u0428') == 'W'  # Cyrillic Ш
        assert normalize_homoglyphs('\u03bf') == 'o'  # Greek ο
        assert normalize_homoglyphs('\u03b5') == 'e'  # Greek ε
        assert normalize_homoglyphs('\u03b1') == 'a'  # Greek α

    def test_non_homoglyph_unicode_passes_through(self):
        # Characters not in HOMOGLYPH_MAP should be unchanged
        result = normalize_homoglyphs('\u4e2d\u6587')  # Chinese characters
        assert result == '\u4e2d\u6587'

    def test_mixed_ascii_and_unicode(self):
        result = normalize_homoglyphs('hello \u0430\u0435 world')
        assert result == 'hello ae world'

    def test_entirely_ascii_returns_unchanged(self):
        result = normalize_homoglyphs('hello world')
        assert result == 'hello world'

    def test_empty_string_returns_empty(self):
        result = normalize_homoglyphs('')
        assert result == ''

    def test_punctuation_preserved(self):
        result = normalize_homoglyphs('!@#$%^&*()[]{}|;:\',.<>?/~`')
        assert result == '!@#$%^&*()[]{}|;:\',.<>?/~`'

    def test_numbers_preserved(self):
        result = normalize_homoglyphs('1234567890')
        assert result == '1234567890'

    def test_combined_homoglyph_word(self):
        # Simulate a homoglyph attack: "p\u0430ssword" looks like "password"
        result = normalize_homoglyphs('p\u0430ssword')
        assert result == 'password'

    def test_realistic_cyrillic_substitution(self):
        # Mix of homoglyphs and non-homoglyphs
        result = normalize_homoglyphs('\u0440\u0438\u0432\u0435\u0442')  # Cyrillic "ривет"
        # Only р (U+0440) maps to 'p'; и, в, е, т pass through
        assert result[0] == 'p'
        assert '\u0440' not in result  # р should be replaced

    def test_homoglyph_map_greek_o(self):
        # Greek omicron (ο, U+03BF) should normalize to 'o'
        assert normalize_homoglyphs('\u03bf') == 'o'
        # Greek Capital Omicron (Ο, U+039F) maps to 'O'
        assert normalize_homoglyphs('\u039f') == 'O'

    def test_whitespace_preserved(self):
        result = normalize_homoglyphs('  \t\n  ')
        assert result == '  \t\n  '
