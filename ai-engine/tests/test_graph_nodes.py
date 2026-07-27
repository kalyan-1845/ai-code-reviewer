"""Unit tests for ai-engine/src/graph/nodes.py langgraph workflow nodes."""

import pytest
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node
from src.graph.state import AgentState


class TestChunkerNode:
    """Tests for chunker_node()"""

    def test_git_diff_format_split(self):
        """Git diff format should split on 'diff --git' markers."""
        state = {'raw_diff': 'diff --git a/main.py\n--- a/main.py\n+++ b/main.py\n+print(1)\ndiff --git b/utils.py\n--- a/utils.py\n+++ b/utils.py\n+print(2)'}
        result = chunker_node(state)
        assert 'chunks' in result
        assert len(result['chunks']) == 2
        assert 'diff --git a/main.py' in result['chunks'][0]
        assert 'diff --git b/utils.py' in result['chunks'][1]

    def test_no_diff_markers_splits_by_lines(self):
        """Without diff markers, chunks should be split by line with chunk_size=100."""
        lines = ['line ' + str(i) for i in range(250)]
        raw_diff = '\n'.join(lines)
        state = {'raw_diff': raw_diff}
        result = chunker_node(state)
        assert len(result['chunks']) > 1

    def test_empty_raw_diff_returns_empty_chunks(self):
        state = {'raw_diff': ''}
        result = chunker_node(state)
        assert result['chunks'] == ['']

    def test_initializes_state_fields(self):
        state = {'raw_diff': 'diff --git a/main.py\n--- a/main.py\n+++ b/main.py\n+print(1)'}
        result = chunker_node(state)
        assert result['current_index'] == 0
        assert result['micro_reviews'] == []


class TestReviewerNode:
    """Tests for reviewer_node()"""

    def test_adds_micro_review_for_current_chunk(self):
        state = {
            'chunks': ['chunk 1 content', 'chunk 2 content'],
            'current_index': 0,
            'micro_reviews': [],
        }
        result = reviewer_node(state)
        assert len(result['micro_reviews']) == 1
        assert 'Micro-review for chunk 1/2' in result['micro_reviews'][0]
        assert result['current_index'] == 1

    def test_increments_index(self):
        state = {
            'chunks': ['chunk 1'],
            'current_index': 0,
            'micro_reviews': [],
        }
        result = reviewer_node(state)
        assert result['current_index'] == 1

    def test_skips_review_when_index_exceeds_chunks(self):
        """reviewer_node increments index even when past the last chunk."""
        state = {
            'chunks': ['chunk 1'],
            'current_index': 1,
            'micro_reviews': [],
        }
        result = reviewer_node(state)
        assert result['micro_reviews'] == []
        # index is incremented regardless
        assert result['current_index'] == 2

    def test_preserves_existing_micro_reviews(self):
        state = {
            'chunks': ['chunk 1', 'chunk 2'],
            'current_index': 1,
            'micro_reviews': ['existing review'],
        }
        result = reviewer_node(state)
        assert len(result['micro_reviews']) == 2
        assert 'existing review' in result['micro_reviews']


class TestSynthesizerNode:
    """Tests for synthesizer_node()"""

    def test_combines_micro_reviews_with_newlines(self):
        state = {
            'micro_reviews': ['Review 1 content', 'Review 2 content'],
            'final_review': '',
        }
        result = synthesizer_node(state)
        assert 'Review 1 content' in result['final_review']
        assert 'Review 2 content' in result['final_review']
        assert '\n\n' in result['final_review']

    def test_empty_micro_reviews_returns_default_message(self):
        state = {'micro_reviews': [], 'final_review': ''}
        result = synthesizer_node(state)
        assert result['final_review'] == 'No micro-reviews to synthesize.'

    def test_single_review_no_extra_newlines(self):
        state = {'micro_reviews': ['Single review'], 'final_review': ''}
        result = synthesizer_node(state)
        assert result['final_review'] == 'Single review'
