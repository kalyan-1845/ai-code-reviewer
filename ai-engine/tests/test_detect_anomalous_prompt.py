import pytest
from fastapi import HTTPException
from app import detect_anomalous_prompt


class TestDetectAnomalousPrompt:
    def test_empty_string_returns_without_error(self):
        # Empty string should return None without raising
        result = detect_anomalous_prompt('')
        assert result is None

    def test_normal_ascii_prompt_returns_without_error(self):
        # Normal ASCII prompts should pass without raising
        prompt = 'You are a helpful assistant. Please analyze the code.'
        result = detect_anomalous_prompt(prompt)
        assert result is None

    def test_short_ascii_prompt_returns_without_error(self):
        # Even short prompts should pass if no homoglyphs
        prompt = 'Hi'
        result = detect_anomalous_prompt(prompt)
        assert result is None

    def test_prompt_with_homoglyphs_below_threshold_passes(self):
        # Homoglyph proportion < 30% should not raise
        # Mix 5 normal chars with 1 homoglyph = ~17% proportion
        prompt = 'Hello ' + '\u0430' + ' world test'  # 6 chars, 1 homoglyph
        result = detect_anomalous_prompt(prompt)
        assert result is None

    def test_prompt_with_homoglyphs_above_threshold_raises(self):
        # More than 30% homoglyphs should raise HTTPException
        # Create a string with mostly homoglyphs
        homoglyphs = '\u0430\u0435\u043e\u0441\u0440'  # 5 homoglyphs
        normal = 'abc'  # 3 normal chars
        prompt = homoglyphs * 2 + normal  # 10 homoglyphs, 3 normal = 77%
        with pytest.raises(HTTPException) as exc_info:
            detect_anomalous_prompt(prompt)
        assert exc_info.value.status_code == 400
        assert 'confusable Unicode' in exc_info.value.detail

    def test_prompt_with_only_cyrillic_raises_due_to_homoglyph_proportion(self):
        # A prompt that is entirely Cyrillic: 5/6 = 83% homoglyphs, above 30% threshold
        # This raises HTTPException because proportion > 30%
        prompt = '\u043f\u0440\u0438\u0432\u0435\u0442'  # Russian "привет" - 5 chars in HOMOGLYPH_MAP out of 6
        with pytest.raises(HTTPException) as exc_info:
            detect_anomalous_prompt(prompt)
        assert exc_info.value.status_code == 400

    def test_prompt_with_only_greek_script_flagged(self):
        # Entirely Greek prompt should also be flagged
        prompt = '\u0391\u0392\u0393'  # Greek letters Alpha Beta Gamma
        import pytest
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            detect_anomalous_prompt(prompt)

    def test_mixed_latin_and_cyrillic_low_proportion(self):
        # Mixed scripts with majority Latin should not raise
        latin = 'a' * 20
        cyrillic = '\u0430\u0435'  # Just 2 Cyrillic chars
        prompt = latin + cyrillic
        result = detect_anomalous_prompt(prompt)
        assert result is None

    def test_prompt_at_exact_30_percent_threshold(self):
        # At exactly 30% homoglyphs, should still pass (threshold is > 30%)
        chars = list('a' * 7) + ['\u0430']  # 7 normal + 1 homoglyph = 12.5%
        # Even at high proportion but < 30%, should pass
        prompt = ''.join(chars * 4)  # 28 normal + 4 homoglyphs = 12.5%
        result = detect_anomalous_prompt(prompt)
        assert result is None
