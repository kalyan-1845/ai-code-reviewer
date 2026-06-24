import pytest
from app import normalize_homoglyphs

def test_normalize_known_homoglyphs():
    assert normalize_homoglyphs('\u0430') == 'a'
    assert normalize_homoglyphs('\u043E') == 'o'
    assert normalize_homoglyphs('\u0435') == 'e'

def test_normalize_non_homoglyph_characters():
    assert normalize_homoglyphs('hello world!') == 'hello world!'
    assert normalize_homoglyphs('12345') == '12345'

def test_normalize_mixed_ascii_and_unicode():
    text = f"h{chr(0x0435)}ll{chr(0x043E)} w{chr(0x043E)}rld"
    assert normalize_homoglyphs(text) == 'hello world'

def test_normalize_entirely_ascii():
    assert normalize_homoglyphs('abcdefghijklmnopqrstuvwxyz') == 'abcdefghijklmnopqrstuvwxyz'
    assert normalize_homoglyphs('ABCDEFGHIJKLMNOPQRSTUVWXYZ') == 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

def test_normalize_non_mapped_unicode():
    assert normalize_homoglyphs('你好 🌍') == '你好 🌍'
    assert normalize_homoglyphs('\u0431') == '\u0431'

def test_normalize_empty_string():
    assert normalize_homoglyphs('') == ''
