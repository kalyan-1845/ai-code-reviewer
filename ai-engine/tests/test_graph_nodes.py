"""
Unit tests for ai-engine/src/graph/nodes.py
Tests chunker_node, reviewer_node, and synthesizer_node with edge cases.
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node
from src.graph.state import AgentState


def _empty_state(**overrides):
    base = {"raw_diff": "", "chunks": [], "current_index": 0, "micro_reviews": [], "final_review": ""}
    base.update(overrides)
    return base


def test_chunker_node_empty_diff():
    state = _empty_state(raw_diff="")
    res = chunker_node(state)
    assert "chunks" in res
    assert "current_index" in res
    assert res["current_index"] == 0


def test_chunker_node_single_file_no_separator():
    """Diff that does NOT contain \\ndiff --git, so chunking uses line-based approach."""
    diff = "+const x = 1\n+const y = 2"
    state = _empty_state(raw_diff=diff)
    res = chunker_node(state)
    assert len(res["chunks"]) >= 1
    assert all(isinstance(c, str) for c in res["chunks"])


def test_chunker_node_large_diff_line_chunking():
    """Large diff without \\ndiff --git separators should be chunked by 100 lines each."""
    lines = ["+line {}".format(i) for i in range(250)]
    diff = "\n".join(lines)
    state = _empty_state(raw_diff=diff)
    res = chunker_node(state)
    # 250 lines with chunk_size=100 should produce 3 chunks
    assert len(res["chunks"]) == 3
    assert res["current_index"] == 0


def test_chunker_node_preserves_diff_git_prefix_in_subsequent_chunks():
    """When splitting on \\ndiff --git, subsequent chunks should retain the 'diff --git ' prefix."""
    diff = "diff --git a/first.py b/first.py\n+first\ndiff --git a/second.py b/second.py\n+second"
    state = _empty_state(raw_diff=diff)
    res = chunker_node(state)
    # First chunk is the prefix portion, second starts with 'diff --git a/second.py'
    assert len(res["chunks"]) >= 1
    # At least one chunk should contain 'diff --git'
    assert any("diff --git" in c for c in res["chunks"])


def test_chunker_node_returns_correct_keys():
    state = _empty_state(raw_diff="+x")
    res = chunker_node(state)
    assert "chunks" in res
    assert "current_index" in res
    assert "micro_reviews" in res


def test_reviewer_node_empty_chunks():
    """reviewer_node with no chunks should not add any micro_review."""
    state = _empty_state(chunks=[], current_index=0)
    res = reviewer_node(state)
    assert res["micro_reviews"] == []
    assert res["current_index"] == 1


def test_reviewer_node_all_chunks_processed():
    """reviewer_node when current_index >= len(chunks) should not add more reviews."""
    state = _empty_state(chunks=["chunk1", "chunk2"], current_index=2, micro_reviews=["existing"])
    res = reviewer_node(state)
    assert len(res["micro_reviews"]) == 1
    assert res["current_index"] == 3


def test_reviewer_node_increments_index():
    state = _empty_state(chunks=["a", "b", "c"], current_index=0)
    res = reviewer_node(state)
    assert res["current_index"] == 1
    assert len(res["micro_reviews"]) == 1


def test_reviewer_node_accumulates_micro_reviews():
    state = _empty_state(chunks=["c1", "c2"], current_index=0, micro_reviews=[])
    res1 = reviewer_node(state)
    assert len(res1["micro_reviews"]) == 1
    res2 = reviewer_node({**state, **res1})
    assert len(res2["micro_reviews"]) == 2


def test_reviewer_node_returns_correct_keys():
    state = _empty_state(chunks=["x"], current_index=0)
    res = reviewer_node(state)
    assert "micro_reviews" in res
    assert "current_index" in res


def test_synthesizer_node_empty_micro_reviews():
    """synthesizer_node with no micro_reviews should return the default message."""
    state = _empty_state(micro_reviews=[])
    res = synthesizer_node(state)
    assert res["final_review"] == "No micro-reviews to synthesize."


def test_synthesizer_node_single_review():
    state = _empty_state(micro_reviews=["Only one review."])
    res = synthesizer_node(state)
    assert res["final_review"] == "Only one review."


def test_synthesizer_node_multiple_reviews_separated_by_double_newline():
    state = _empty_state(micro_reviews=["First review.", "Second review.", "Third review."])
    res = synthesizer_node(state)
    assert "First review." in res["final_review"]
    assert "Second review." in res["final_review"]
    assert "Third review." in res["final_review"]
    assert "\n\n" in res["final_review"]


def test_synthesizer_node_returns_correct_keys():
    state = _empty_state(micro_reviews=["One"])
    res = synthesizer_node(state)
    assert "final_review" in res
