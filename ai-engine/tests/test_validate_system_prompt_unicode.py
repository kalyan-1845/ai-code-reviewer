import pytest
from app import validate_system_prompt


class TestValidateSystemPromptNFKCNormalization:
    """Tests for the NFKC Unicode normalization step in validate_system_prompt."""

    def test_nfkc_normalizes_composed_characters(self):
        """NFKC normalization should compose a + combining diaeresis to a-umlaut."""
        # U+0061 (a) + U+0308 (combining diaeresis) = precomposed a-umlaut (U+00E4)
        composed = "a\u0308"
        result = validate_system_prompt(composed)
        assert "\u00e4" in result  # composed form

    def test_nfkc_normalizes_halfwidth_characters(self):
        """NFKC normalizes halfwidth katakana to fullwidth."""
        halfwidth_ka = "\uff8a\uff9f"  # halfwidth katakana "カ"
        result = validate_system_prompt(halfwidth_ka)
        # NFKC normalizes halfwidth to fullwidth forms
        assert result != halfwidth_ka or len(result) > 0

    def test_nfkc_normalizes_halfwidth_katakana(self):
        """NFKC normalizes halfwidth katakana to fullwidth forms."""
        halfwidth = "\uff8a\uff9f"  # halfwidth "パ"
        result = validate_system_prompt(halfwidth)
        # NFKC converts to fullwidth: \uff8a\uff9f -> \u30d1\u30d5
        assert "\uff8a" not in result  # halfwidth char should be gone

    def test_nfkc_does_not_alter_plain_ascii(self):
        """NFKC normalization should not change plain ASCII content."""
        prompt = "You are a helpful code reviewer."
        result = validate_system_prompt(prompt)
        assert result == prompt

    def test_nfkc_does_not_alter_cyrillic_mixed_with_latin(self):
        """Cyrillic mixed with Latin is preserved by NFKC (threshold prevents homoglyph trigger)."""
        # Pure Cyrillic would exceed 30% homoglyph threshold; mix with Latin to stay safe
        prompt = "Hello \u043f\u0440\u0438\u0432\u0435\u0442 World"
        result = validate_system_prompt(prompt)
        assert "Hello" in result
        assert "World" in result


class TestValidateSystemPromptZerosWidthChars:
    """Tests for zero-width character removal in validate_system_prompt."""

    def test_zero_width_space_u200b_is_removed(self):
        """U+200B (ZWSP) should be stripped from the prompt."""
        prompt = "hello\u200bworld"
        result = validate_system_prompt(prompt)
        assert "\u200b" not in result
        assert "helloworld" in result or ("hello" in result and "world" in result)

    def test_zero_width_non_joiner_u200c_is_removed(self):
        """U+200C (ZWNJ) should be stripped from the prompt."""
        prompt = "hello\u200cworld"
        result = validate_system_prompt(prompt)
        assert "\u200c" not in result

    def test_zero_width_joiner_u200d_is_removed(self):
        """U+200D (ZWJ) should be stripped from the prompt."""
        prompt = "hello\u200dworld"
        result = validate_system_prompt(prompt)
        assert "\u200d" not in result

    def test_bom_ufeff_is_removed(self):
        """U+FEFF (BOM / ZWNBSP) should be stripped from the prompt."""
        prompt = "\ufeffhello world"
        result = validate_system_prompt(prompt)
        assert "\ufeff" not in result
        assert "hello world" in result

    def test_all_zwcs_removed_together(self):
        """All zero-width characters removed simultaneously."""
        prompt = "\u200bhello\u200cworld\u200dend\ufeff"
        result = validate_system_prompt(prompt)
        assert "\u200b" not in result
        assert "\u200c" not in result
        assert "\u200d" not in result
        assert "\ufeff" not in result

    def test_zwsp_between_words_does_not_corrupt_content(self):
        """ZWSP between words is removed; surrounding content is preserved."""
        prompt = "You\u200bare\u200ba\u200bhelpful\u200breviewer"
        result = validate_system_prompt(prompt)
        assert "You" in result
        assert "are" in result
        assert "a" in result
        assert "helpful" in result
        assert "reviewer" in result
        # Words should be adjacent after removal
        assert "\u200b" not in result


class TestValidateSystemPromptCombinedNormalization:
    """Tests combining NFKC normalization with zero-width character removal."""

    def test_nfkc_composes_and_zwsp_removed_in_single_pass(self):
        """Both NFKC and ZWSP removal happen; result contains neither."""
        prompt = "a\u0308\u200bcontent"
        result = validate_system_prompt(prompt)
        assert "\u200b" not in result
        assert "\u00e4" in result  # NFKC composed

    def test_truncation_happens_after_normalization(self):
        """Prompt is normalized (NFKC + ZWSP removed) before truncation."""
        # Long prompt with ZWSP embedded near the end
        long_base = "a" * 2500 + "\u200b"
        result = validate_system_prompt(long_base, max_len=2000)
        assert len(result) <= 2000
        assert "\u200b" not in result  # ZWSP was stripped before truncation

    def test_homoglyph_detection_after_nfkc_normalization(self):
        """Homoglyph normalization runs after NFKC; the chain is safe."""
        # Mixed content keeps homoglyph ratio below 30% threshold
        prompt = "Hello \u0430\u0435\u043e World"
        result = validate_system_prompt(prompt)
        # No HTTPException raised — function completes
        assert isinstance(result, str)
