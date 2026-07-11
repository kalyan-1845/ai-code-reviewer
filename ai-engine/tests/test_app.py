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
        assert result == "llama-3.1-70b-versatile"

    def test_maps_8b_alias(self):
        result = get_groq_model("8b-model")
        assert result == "llama-3.3-70b-versatile"

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