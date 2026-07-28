import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.graph.tracing import init_telemetry, get_tracing_config
from src.graph.workflow import invoke_graph, build_graph
from src.graph.state import AgentState


def test_init_telemetry_disabled(monkeypatch):
    monkeypatch.delenv("LANGCHAIN_TRACING_V2", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    
    # Import and test with reset flag
    import src.graph.tracing as tracing_mod
    tracing_mod._telemetry_initialized = False
    
    res = init_telemetry()
    assert res is False


def test_init_telemetry_enabled(monkeypatch):
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "true")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    
    import src.graph.tracing as tracing_mod
    tracing_mod._telemetry_initialized = False
    
    res = init_telemetry()
    assert res is True


def test_get_tracing_config_disabled(monkeypatch):
    monkeypatch.delenv("LANGCHAIN_TRACING_V2", raising=False)
    config = get_tracing_config()
    assert config == {}


def test_get_tracing_config_with_custom_callbacks():
    custom_cb = "mock_callback"
    config = get_tracing_config(callbacks=[custom_cb])
    assert "callbacks" in config
    assert custom_cb in config["callbacks"]


def test_invoke_graph_with_tracing(monkeypatch):
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "true")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "test_key")
    monkeypatch.setenv("LANGCHAIN_PROJECT", "test_project")

    initial_state: AgentState = {
        "raw_diff": "diff --git a/test.py b/test.py\n+val = 42",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }

    result = invoke_graph(initial_state)
    assert "final_review" in result
    assert result["current_index"] == 1
    assert len(result["micro_reviews"]) == 1
    assert "Micro-review for chunk 1/1" in result["micro_reviews"][0]
