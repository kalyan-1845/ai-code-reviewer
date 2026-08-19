import pytest
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node


class TestChunkerNode:
    def test_returns_empty_chunks_when_raw_diff_is_empty(self):
        result = chunker_node({})
        assert result["chunks"] == []
        assert result["current_index"] == 0
        assert result["micro_reviews"] == []

    def test_returns_empty_chunks_when_raw_diff_is_whitespace_only(self):
        result = chunker_node({"raw_diff": "   \n\n  "})
        assert result["chunks"] == []
        assert result["current_index"] == 0

    def test_splits_diff_on_diff_git_boundaries(self):
        raw = (
            "diff --git a/foo.js b/foo.js\n"
            "--- a/foo.js\n"
            "+ new line\n"
            "diff --git b/bar.js b/bar.js\n"
            "--- a/bar.js\n"
            "+ another change\n"
        )
        result = chunker_node({"raw_diff": raw})
        chunks = result["chunks"]
        assert len(chunks) == 2
        assert chunks[0].startswith("diff --git a/foo.js")
        assert chunks[1].startswith("diff --git b/bar.js")

    def test_falls_back_to_line_based_chunking_when_no_diff_git_markers(self):
        lines = ["line " + str(i) for i in range(250)]
        raw = "\n".join(lines)
        result = chunker_node({"raw_diff": raw})
        chunks = result["chunks"]
        # Default chunk size is 100 lines
        assert len(chunks) == 3  # 100 + 100 + 50
        assert len(chunks[0].splitlines()) == 100
        assert len(chunks[1].splitlines()) == 100
        assert len(chunks[2].splitlines()) == 50

    def test_sets_current_index_to_zero_and_micro_reviews_to_empty(self):
        result = chunker_node({"raw_diff": "some content"})
        assert result["current_index"] == 0
        assert result["micro_reviews"] == []


class TestReviewerNode:
    def test_advances_current_index_by_one_per_call(self):
        state = {
            "chunks": ["chunk0", "chunk1", "chunk2"],
            "current_index": 0,
            "micro_reviews": [],
        }
        result = reviewer_node(state)
        assert result["current_index"] == 1

        result2 = reviewer_node(result)
        assert result2["current_index"] == 2

    def test_appends_micro_review_when_chunks_remain(self):
        from src.graph.nodes import set_reviewer_llm_caller

        set_reviewer_llm_caller(
            lambda system_prompt, user_prompt: "LLM micro-review for chunk 1/2"
        )
        state = {
            "chunks": ["chunk0", "chunk1"],
            "current_index": 0,
            "micro_reviews": [],
        }
        result = reviewer_node(state)
        assert len(result["micro_reviews"]) == 1
        assert result["micro_reviews"][0] == "LLM micro-review for chunk 1/2"

    def test_does_not_append_when_current_index_exceeds_chunks(self):
        state = {
            "chunks": ["chunk0"],
            "current_index": 1,
            "micro_reviews": ["existing"],
        }
        result = reviewer_node(state)
        assert result["micro_reviews"] == ["existing"]

    def test_works_with_empty_chunks_list(self):
        state = {
            "chunks": [],
            "current_index": 0,
            "micro_reviews": [],
        }
        result = reviewer_node(state)
        assert result["current_index"] == 1
        assert result["micro_reviews"] == []


class TestSynthesizerNode:
    def test_joins_micro_reviews_with_double_newlines(self):
        state = {
            "micro_reviews": [
                "Review of chunk 1: all good.",
                "Review of chunk 2: minor issue.",
            ]
        }
        result = synthesizer_node(state)
        assert result["final_review"] == "Review of chunk 1: all good.\n\nReview of chunk 2: minor issue."

    def test_returns_no_micro_reviews_message_when_empty(self):
        state = {"micro_reviews": []}
        result = synthesizer_node(state)
        assert result["final_review"] == "No micro-reviews to synthesize."

    def test_returns_no_micro_reviews_message_when_micro_reviews_is_missing(self):
        state = {}
        result = synthesizer_node(state)
        assert result["final_review"] == "No micro-reviews to synthesize."

    def test_works_with_single_micro_review(self):
        state = {"micro_reviews": ["Only chunk reviewed: looks fine."]}
        result = synthesizer_node(state)
        assert result["final_review"] == "Only chunk reviewed: looks fine."
