import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from nodes.triage_node import trivial_approval_node


class TestTrivialApprovalNode:
    """Unit tests for trivial_approval_node."""

    def test_returns_final_review_key(self):
        """trivial_approval_node should return a dict with final_review key."""
        result = trivial_approval_node({})
        assert isinstance(result, dict)
        assert "final_review" in result

    def test_returns_expected_approval_message(self):
        """trivial_approval_node should return the expected approval message."""
        result = trivial_approval_node({})
        assert result["final_review"] == "LGTM - Trivial Change Bypassed Heavy Review"

    def test_returns_empty_dict_state(self):
        """trivial_approval_node should work with empty state."""
        result = trivial_approval_node({})
        assert "final_review" in result
        assert len(result) == 1

    def test_ignores_input_state(self):
        """trivial_approval_node should not be affected by input state content."""
        state_with_data = {
            "modified_files": ["README.md"],
            "raw_diff": "+console.log('hello');",
            "is_trivial": True,
            "pr_category": "TRIVIAL"
        }
        result = trivial_approval_node(state_with_data)
        assert result["final_review"] == "LGTM - Trivial Change Bypassed Heavy Review"
