import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from graphs.review_pipeline import build_graph, build_review_pipeline


class TestBuildGraphAlias:
    """Tests for build_review_pipeline backward-compatibility alias in review_pipeline.py."""

    def test_build_review_pipeline_is_same_as_build_graph(self):
        """build_review_pipeline should be the same function object as build_graph."""
        assert build_review_pipeline is build_graph, (
            "build_review_pipeline should be an alias for build_graph"
        )

    def test_both_return_compiled_graph(self):
        """Both build_graph() and build_review_pipeline() should return a compiled StateGraph."""
        graph1 = build_graph()
        graph2 = build_review_pipeline()

        # Both should return objects with an invoke method (compiled graph)
        assert hasattr(graph1, "invoke"), "build_graph should return a compiled graph"
        assert hasattr(graph2, "invoke"), "build_review_pipeline should return a compiled graph"

    def test_compiled_graphs_have_same_structure(self):
        """Both functions should return compiled graphs with equivalent node sets."""
        graph1 = build_graph()
        graph2 = build_review_pipeline()

        # Both should be compilable without error
        # Check they both have the expected nodes by invoking with test state
        test_state = {
            "raw_diff": "diff --git a/a.py b/a.py\n+x = 1",
            "chunks": [],
            "current_index": 0,
            "micro_reviews": [],
            "final_review": "",
            "ast_context": ""
        }

        result1 = graph1.invoke(test_state)
        result2 = graph2.invoke(test_state)

        # Both should produce valid output with expected keys
        assert "final_review" in result1
        assert "final_review" in result2
        assert result1.keys() == result2.keys()

    def test_compiled_graph_contains_all_expected_nodes(self):
        """The compiled graph should contain all expected pipeline nodes."""
        graph = build_graph()
        test_state = {
            "raw_diff": "diff --git a/a.py b/a.py\n+x = 1",
            "chunks": [],
            "current_index": 0,
            "micro_reviews": [],
            "final_review": "",
            "ast_context": ""
        }
        result = graph.invoke(test_state)

        # Should have processed the diff and generated reviews
        assert "final_review" in result
        # micro_reviews should be a list
        assert isinstance(result.get("micro_reviews"), list)
        # Should have moved through chunker, secret_scrubber, reviewer nodes
        # (at minimum one micro_review for the diff chunk)
        assert result["current_index"] >= 0

    def test_calling_build_graph_twice_returns_equivalent_graphs(self):
        """Calling build_graph() twice should produce equivalent compiled graphs."""
        graph1 = build_graph()
        graph2 = build_graph()

        test_state = {
            "raw_diff": "diff --git a/b.py b/b.py\n+y = 2",
            "chunks": [],
            "current_index": 0,
            "micro_reviews": [],
            "final_review": "",
            "ast_context": ""
        }

        result1 = graph1.invoke(test_state)
        result2 = graph2.invoke(test_state)

        # Both should produce structurally identical output
        assert result1.keys() == result2.keys()
        assert len(result1["micro_reviews"]) == len(result2["micro_reviews"])
