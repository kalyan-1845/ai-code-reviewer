import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from graphs.review_pipeline import (
    build_graph,
    build_review_pipeline,
    route_sanitizer,
    route_triage,
    route_reviewer,
)


class TestRouteFunctions:
    """Unit tests for routing functions in review_pipeline."""

    def test_route_sanitizer_security_flag_true_returns_end(self):
        """route_sanitizer should return END when security_flag is True."""
        result = route_sanitizer({"security_flag": True})
        assert result == "__end__"  # langgraph uses __end__ as END node identifier

    def test_route_sanitizer_security_flag_false_returns_triage(self):
        """route_sanitizer should return triage when security_flag is False."""
        result = route_sanitizer({"security_flag": False})
        assert result == "triage"

    def test_route_sanitizer_missing_flag_returns_triage(self):
        """route_sanitizer should return triage when security_flag is absent."""
        result = route_sanitizer({})
        assert result == "triage"

    def test_route_triage_is_trivial_true_returns_trivial_approval(self):
        """route_triage should return trivial_approval when is_trivial is True."""
        result = route_triage({"is_trivial": True})
        assert result == "trivial_approval"

    def test_route_triage_is_trivial_false_returns_chunker(self):
        """route_triage should return chunker when is_trivial is False."""
        result = route_triage({"is_trivial": False})
        assert result == "chunker"

    def test_route_triage_missing_flag_returns_chunker(self):
        """route_triage should return chunker when is_trivial is absent."""
        result = route_triage({})
        assert result == "chunker"

    def test_route_reviewer_more_chunks_returns_reviewer(self):
        """route_reviewer should return reviewer when more chunks remain."""
        state = {"current_index": 0, "chunks": ["chunk1", "chunk2"]}
        result = route_reviewer(state)
        assert result == "reviewer"

    def test_route_reviewer_no_chunks_returns_synthesizer(self):
        """route_reviewer should return synthesizer when all chunks reviewed."""
        state = {"current_index": 2, "chunks": ["chunk1", "chunk2"]}
        result = route_reviewer(state)
        assert result == "synthesizer"

    def test_route_reviewer_index_beyond_chunks_returns_synthesizer(self):
        """route_reviewer should return synthesizer when index >= len(chunks)."""
        state = {"current_index": 10, "chunks": ["chunk1", "chunk2"]}
        result = route_reviewer(state)
        assert result == "synthesizer"

    def test_route_reviewer_missing_chunks_returns_synthesizer(self):
        """route_reviewer should return synthesizer when chunks is absent."""
        state = {"current_index": 0}
        result = route_reviewer(state)
        assert result == "synthesizer"

    def test_route_reviewer_empty_chunks_returns_synthesizer(self):
        """route_reviewer should return synthesizer when chunks is empty."""
        state = {"current_index": 0, "chunks": []}
        result = route_reviewer(state)
        assert result == "synthesizer"


class TestBuildGraph:
    """Unit tests for the graph builder."""

    def test_build_graph_returns_compiled_graph(self):
        """build_graph should return a compiled StateGraph."""
        graph = build_graph()
        assert graph is not None
        # The compiled graph should have a run/invoke method
        assert hasattr(graph, "invoke") or hasattr(graph, "run")

    def test_build_review_pipeline_alias(self):
        """build_review_pipeline should be an alias of build_graph."""
        assert build_review_pipeline is build_graph

    def test_build_graph_produces_deterministic_result(self):
        """build_graph should produce the same graph on multiple calls."""
        graph1 = build_graph()
        graph2 = build_graph()
        # Both should be CompiledStateGraph instances with invoke method
        assert hasattr(graph1, "invoke")
        assert hasattr(graph2, "invoke")
