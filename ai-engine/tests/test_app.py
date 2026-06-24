import pytest
from app import get_groq_model


class TestGetGroqModel:
    def test_returns_default_for_none(self):
        result = get_groq_model(None)
        assert result == "llama-3.3-70b-versatile"

    def test_returns_default_for_empty_string(self):
        result = get_groq_model("")
        assert result == "llama-3.3-70b-versatile"

    def test_maps_deepseek_r1(self):
        result = get_groq_model("deepseek-r1-distill-llama-70b")
        assert result == "deepseek-r1-distill-llama-70b"

    def test_maps_deepseek_case_insensitive(self):
        result = get_groq_model("DeepSeek-R1")
        assert result == "deepseek-r1-distill-llama-70b"

    def test_maps_llama_31_8b_instant(self):
        result = get_groq_model("llama-3.1-8b-instant")
        assert result == "llama-3.1-8b-instant"

    def test_maps_llama_31_alias(self):
        result = get_groq_model("llama-3.1-70b")
        assert result == "llama-3.1-8b-instant"

    def test_maps_8b_alias(self):
        result = get_groq_model("8b-model")
        assert result == "llama-3.1-8b-instant"

    def test_maps_gemma(self):
        result = get_groq_model("gemma2-9b-it")
        assert result == "gemma2-9b-it"

    def test_maps_gemma_case_insensitive(self):
        result = get_groq_model("Gemma-7B")
        assert result == "gemma2-9b-it"

    def test_returns_default_for_unknown_model(self):
        result = get_groq_model("unknown-model-xyz")
        assert result == "llama-3.3-70b-versatile"

    def test_returns_default_for_arbitrary_string(self):
        result = get_groq_model("claude-sonnet")
        assert result == "llama-3.3-70b-versatile"

class TestDetectAnomalousPrompt:
    def test_empty_prompt_returns_none(self):
        from app import detect_anomalous_prompt
        assert detect_anomalous_prompt("") is None

    def test_normal_prompt_passes(self):
        from app import detect_anomalous_prompt
        # Should not raise any exception
        detect_anomalous_prompt("This is a normal prompt.")

    def test_high_homoglyph_count_raises_exception(self):
        from app import detect_anomalous_prompt
        from fastapi import HTTPException
        # 4 chars, 2 homoglyphs ('а' cyrillic, 'о' greek?)
        # Let's just use chars from HOMOGLYPH_MAP:
        # \u0430 (a), \u043e (o), \u0435 (e), \u0441 (c)
        prompt = "a \u0430 \u043e \u0435 \u0441"
        with pytest.raises(HTTPException) as excinfo:
            detect_anomalous_prompt(prompt)
        assert excinfo.value.status_code == 400
        assert "unusually high proportion" in excinfo.value.detail

    def test_mixed_scripts_warns_but_passes(self, capsys):
        from app import detect_anomalous_prompt
        # One cyrillic character, < 30% homoglyphs
        prompt = "This is mostly english with one \u0430 cyrillic."
        detect_anomalous_prompt(prompt)
        captured = capsys.readouterr()
        assert "non-Latin script characters:" in captured.out
        assert "cyrillic" in captured.out