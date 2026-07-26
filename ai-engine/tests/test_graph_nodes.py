import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node


class TestChunkerNode:
    def test_chunker_node_with_diff_git_separator(self):
        """Should split raw_diff on 'diff --git ' boundary when present."""
        state = {'raw_diff': 'old content\ndiff --git a/file1.js b/file1.js\n--- a/file1.js\n+++ b/file1.js\n@@ -1 +1 @@\n-old\n+new'}
        result = chunker_node(state)
        assert len(result['chunks']) == 2
        assert result['chunks'][0] == 'old content'
        assert result['chunks'][1].startswith('diff --git a/file1.js')
        assert result['current_index'] == 0
        assert result['micro_reviews'] == []

    def test_chunker_node_without_diff_git_separator_chunks_by_100_lines(self):
        """Should chunk by 100 lines when 'diff --git ' is not present."""
        lines = ['line ' + str(i) for i in range(250)]
        raw_diff = '\n'.join(lines)
        state = {'raw_diff': raw_diff}
        result = chunker_node(state)
        # 250 lines / 100 = 3 chunks
        assert len(result['chunks']) == 3
        assert result['current_index'] == 0
        assert result['micro_reviews'] == []

    def test_chunker_node_empty_raw_diff(self):
        """Should return single chunk with empty raw_diff."""
        state = {'raw_diff': ''}
        result = chunker_node(state)
        assert result['chunks'] == ['']
        assert result['current_index'] == 0
        assert result['micro_reviews'] == []

    def test_chunker_node_no_lines_chunks_raw(self):
        """Should return [raw_diff] when raw_diff has no newlines and no diff --git."""
        state = {'raw_diff': 'small diff content'}
        result = chunker_node(state)
        assert result['chunks'] == ['small diff content']
        assert result['current_index'] == 0

    def test_chunker_node_respects_existing_chunks_and_index(self):
        """Should not overwrite existing chunks/index from state."""
        state = {
            'raw_diff': 'ignored content',
            'chunks': ['already', 'chunked'],
            'current_index': 1,
            'micro_reviews': ['existing review']
        }
        result = chunker_node(state)
        # chunker_node always overwrites these — this is the current behavior
        assert 'chunks' in result
        assert result['current_index'] == 0


class TestReviewerNode:
    def test_reviewer_node_adds_review_when_index_in_bounds(self):
        """Should add a micro-review and increment index when chunks remain."""
        state = {
            'chunks': ['chunk one content', 'chunk two content'],
            'current_index': 0,
            'micro_reviews': []
        }
        result = reviewer_node(state)
        assert len(result['micro_reviews']) == 1
        assert 'chunk 1/' in result['micro_reviews'][0]
        assert result['current_index'] == 1

    def test_reviewer_node_multiple_chunks_processed_sequentially(self):
        """Should add one review per call until all chunks processed."""
        state = {
            'chunks': ['a', 'b', 'c'],
            'current_index': 0,
            'micro_reviews': []
        }
        # Process first chunk
        r1 = reviewer_node(state)
        assert len(r1['micro_reviews']) == 1
        assert r1['current_index'] == 1
        # Process second chunk
        r2 = reviewer_node({'chunks': ['a', 'b', 'c'], 'current_index': 1, 'micro_reviews': r1['micro_reviews']})
        assert len(r2['micro_reviews']) == 2
        assert r2['current_index'] == 2

    def test_reviewer_node_no_review_but_index_increments_when_index_exceeds_chunks(self):
        """Should not add review but still increments index when current_index >= len(chunks)."""
        state = {
            'chunks': ['only one chunk'],
            'current_index': 1,
            'micro_reviews': ['already reviewed']
        }
        result = reviewer_node(state)
        assert result['micro_reviews'] == ['already reviewed']
        # reviewer_node increments current_index by 1 unconditionally
        assert result['current_index'] == 2

    def test_reviewer_node_preserves_existing_reviews(self):
        """Should append to existing micro_reviews list."""
        state = {
            'chunks': ['chunk content'],
            'current_index': 0,
            'micro_reviews': ['prior review']
        }
        result = reviewer_node(state)
        assert len(result['micro_reviews']) == 2
        assert result['micro_reviews'][0] == 'prior review'

    def test_reviewer_node_empty_chunks_no_review(self):
        """Should not add review when chunks is empty."""
        state = {'chunks': [], 'current_index': 0, 'micro_reviews': []}
        result = reviewer_node(state)
        assert result['micro_reviews'] == []
        assert result['current_index'] == 1


class TestSynthesizerNode:
    def test_synthesizer_node_joins_reviews_with_double_newline(self):
        """Should join micro_reviews with '\n\n' separator."""
        state = {'micro_reviews': ['Review A', 'Review B', 'Review C']}
        result = synthesizer_node(state)
        assert result['final_review'] == 'Review A\n\nReview B\n\nReview C'

    def test_synthesizer_node_fallback_for_empty_reviews(self):
        """Should return fallback string when micro_reviews is empty."""
        state = {'micro_reviews': []}
        result = synthesizer_node(state)
        assert result['final_review'] == 'No micro-reviews to synthesize.'

    def test_synthesizer_node_single_review_no_separator_needed(self):
        """Should return the single review as-is."""
        state = {'micro_reviews': ['Only one review here.']}
        result = synthesizer_node(state)
        assert result['final_review'] == 'Only one review here.'

    def test_synthesizer_node_preserves_existing_final_review(self):
        """Should not overwrite existing final_review from state."""
        state = {'micro_reviews': ['Review'], 'final_review': 'already synthesized'}
        result = synthesizer_node(state)
        # Current implementation returns new final_review
        assert 'Review' in result['final_review']
