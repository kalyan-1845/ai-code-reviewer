import time
import pytest
from nodes.model_router import (
    calculate_complexity,
    model_router_node,
    MODEL_GEMMA,
    MODEL_LLAMA,
    MODEL_DEEPSEEK,
)
from services.llm_client import (
    LLMClient,
    RateLimitError,
    ServiceUnavailableError,
    circuit_breaker_fallback,
)
from src.graph.workflow import build_graph


class TestComplexityCalculation:
    def test_low_complexity_routes_to_gemma(self):
        small_diff = "def add(a, b):\n    return a + b\n"
        score, model = calculate_complexity(small_diff, num_files=1)
        assert score < 30.0
        assert model == MODEL_GEMMA

    def test_medium_complexity_routes_to_llama(self):
        medium_diff = "\n".join([
            f"if x == {i}: process({i})" for i in range(35)
        ])
        score, model = calculate_complexity(medium_diff, num_files=1)
        assert 30.0 <= score < 100.0
        assert model == MODEL_LLAMA

    def test_high_complexity_routes_to_deepseek(self):
        large_diff = "\n".join([
            f"if x == {i} and y == {i}:\n    for j in range(10):\n        try_process({i}, {j})"
            for i in range(40)
        ])
        score, model = calculate_complexity(large_diff, num_files=1)
        assert score >= 100.0
        assert model == MODEL_DEEPSEEK

    def test_multi_file_routes_to_deepseek(self):
        small_diff = "x = 1\n"
        score, model = calculate_complexity(small_diff, num_files=5)
        assert model == MODEL_DEEPSEEK


class TestCircuitBreaker:
    def test_circuit_breaker_reroutes_on_429_within_200ms(self):
        client = LLMClient()
        attempted_models = []

        def mock_llm_call(model_name: str):
            attempted_models.append(model_name)
            if model_name == MODEL_GEMMA:
                raise RateLimitError("Rate limit exceeded on Gemma", status_code=429)
            return "SUCCESS_RESPONSE"

        start = time.perf_counter()
        res = client.call_with_fallback(MODEL_GEMMA, mock_llm_call)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert res["fallback_occurred"] is True
        assert res["model_used"] == MODEL_LLAMA
        assert res["result"] == "SUCCESS_RESPONSE"
        assert elapsed_ms < 200.0, f"Fallback took too long: {elapsed_ms}ms"

    def test_circuit_breaker_reroutes_on_503(self):
        client = LLMClient()
        attempted_models = []

        def mock_llm_call(model_name: str):
            attempted_models.append(model_name)
            if model_name == MODEL_LLAMA:
                raise ServiceUnavailableError("Service unavailable", status_code=503)
            return "DEEPSEEK_RESPONSE"

        res = client.call_with_fallback(MODEL_LLAMA, mock_llm_call)
        assert res["fallback_occurred"] is True
        assert res["model_used"] == MODEL_DEEPSEEK
        assert res["result"] == "DEEPSEEK_RESPONSE"

    def test_decorator_circuit_breaker(self):
        attempted = []

        @circuit_breaker_fallback(primary_model=MODEL_GEMMA)
        def run_prompt(model_name: str):
            attempted.append(model_name)
            if model_name == MODEL_GEMMA:
                raise RateLimitError()
            return f"Response from {model_name}"

        res = run_prompt()
        assert res["fallback_occurred"] is True
        assert res["model_used"] == MODEL_LLAMA
        assert "Response from" in res["result"]


class TestGraphWorkflowIntegration:
    def test_graph_execution_populates_model_routing(self):
        graph = build_graph()
        initial_state = {
            "raw_diff": "diff --git a/a.py b/a.py\n+def foo(): pass",
            "chunks": [],
            "current_index": 0,
            "micro_reviews": [],
            "final_review": "",
        }
        output = graph.invoke(initial_state)

        assert "selected_model" in output
        assert "complexity_score" in output
        assert output["selected_model"] in (MODEL_GEMMA, MODEL_LLAMA, MODEL_DEEPSEEK)
