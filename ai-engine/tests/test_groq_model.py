import pytest
from app import get_groq_model


class TestGetGrokModel:
    def test_none_returns_default(self):
        result = get_groq_model(None)
        assert result == "llama-3.3-70b-versatile"

    def test_empty_string_returns_default(self):
        result = get_groq_model("")
        assert result == "llama-3.3-70b-versatile"

    def test_deepseek_maps_to_distill_llama(self):
        result = get_groq_model("deepseek")
        assert result == "deepseek-r1-distill-llama-70b"
        result2 = get_groq_model("DeepSeek-R1")
        assert result2 == "deepseek-r1-distill-llama-70b"

    def test_llama_31_8b_maps_to_instant(self):
        result = get_groq_model("llama-3.1-8b")
        assert result == "llama-3.1-8b-instant"
        result2 = get_groq_model("LLaMA-3.1-8B")
        assert result2 == "llama-3.1-8b-instant"

    def test_8b_alone_maps_to_default(self):
        result = get_groq_model("8b")
        assert result == "llama-3.3-70b-versatile"
        result2 = get_groq_model("8b-instant")
        assert result2 == "llama-3.1-8b-instant"

    def test_gemma_maps_to_gemma2_9b(self):
        result = get_groq_model("gemma")
        assert result == "gemma2-9b-it"
        result2 = get_groq_model("Gemma-7B")
        assert result2 == "gemma2-9b-it"

    def test_unknown_model_returns_default(self):
        result = get_groq_model("gpt-4o")
        assert result == "llama-3.3-70b-versatile"
        result2 = get_groq_model("claude-3")
        assert result2 == "llama-3.3-70b-versatile"
        result3 = get_groq_model("mixtral-8x7b")
        assert result3 == "llama-3.3-70b-versatile"

    def test_case_insensitive(self):
        assert get_groq_model("DEEPSEEK") == "deepseek-r1-distill-llama-70b"
        assert get_groq_model("GEMMA") == "gemma2-9b-it"
        assert get_groq_model("LLAMA-3.1-8B") == "llama-3.1-8b-instant"
