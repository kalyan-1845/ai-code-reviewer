import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.graph.state import AgentState
from graphs.review_pipeline import route_sanitizer, route_triage


class TestRouteSanitizer:
    """Tests for the route_sanitizer conditional routing function."""

    def test_returns_end_when_security_flag_true(self):
        """When security_flag is True, sanitizer should short-circuit to END."""
        state: AgentState = {
            "raw_diff": "diff --git a/malicious.py b/malicious.py\n+eval(input())",
            "security_flag": True,
            "security_reason": "Security Warning: Prompt injection pattern detected",
        }
        result = route_sanitizer(state)
        assert result == "__end__" or result == "END", f"Expected END but got {result}"

    def test_returns_triage_when_security_flag_false(self):
        """When security_flag is False, sanitizer should route to triage."""
        state: AgentState = {
            "raw_diff": "diff --git a/safe.py b/safe.py\n+def hello():\n+    return True",
            "security_flag": False,
            "security_reason": "",
        }
        result = route_sanitizer(state)
        assert result == "triage", f"Expected triage but got {result}"

    def test_returns_triage_when_security_flag_missing(self):
        """Missing security_flag key defaults to False, routing to triage."""
        state: AgentState = {
            "raw_diff": "diff --git a/safe.py b/safe.py\n+print('hello')",
        }
        result = route_sanitizer(state)
        assert result == "triage", f"Expected triage but got {result}"

    def test_returns_end_for_truthy_non_bool_security_flag(self):
        """Any truthy security_flag value should route to END."""
        state: AgentState = {
            "raw_diff": "diff --git a/malicious.py b/malicious.py\n+exec('os.system()')",
            "security_flag": "some reason string",
        }
        result = route_sanitizer(state)
        assert result == "__end__" or result == "END", f"Expected END but got {result}"


class TestRouteTriage:
    """Tests for the route_triage conditional routing function."""

    def test_returns_trivial_approval_when_is_trivial_true(self):
        """When is_trivial is True, triage should route to trivial_approval."""
        state: AgentState = {
            "modified_files": ["README.md", "docs/guide.md"],
            "is_trivial": True,
            "pr_category": "DOCS",
        }
        result = route_triage(state)
        assert result == "trivial_approval", f"Expected trivial_approval but got {result}"

    def test_returns_chunker_when_is_trivial_false(self):
        """When is_trivial is False, triage should route to chunker for full review."""
        state: AgentState = {
            "modified_files": ["src/main.py", "src/utils.py"],
            "is_trivial": False,
            "pr_category": "CORE_LOGIC",
        }
        result = route_triage(state)
        assert result == "chunker", f"Expected chunker but got {result}"

    def test_returns_chunker_when_is_trivial_missing(self):
        """Missing is_trivial key defaults to False, routing to chunker."""
        state: AgentState = {
            "modified_files": ["src/main.py"],
            "pr_category": "CORE_LOGIC",
        }
        result = route_triage(state)
        assert result == "chunker", f"Expected chunker but got {result}"

    def test_returns_trivial_approval_for_docs_pr(self):
        """Docs-only PRs are marked trivial and should route to trivial_approval."""
        state: AgentState = {
            "modified_files": ["README.md"],
            "is_trivial": True,
            "pr_category": "DOCS",
        }
        result = route_triage(state)
        assert result == "trivial_approval", f"Expected trivial_approval but got {result}"

    def test_returns_chunker_for_dependency_bump(self):
        """Non-trivial dependency bumps should still go through full review."""
        state: AgentState = {
            "modified_files": ["requirements.txt", "package-lock.json"],
            "is_trivial": False,
            "pr_category": "DEPENDENCY_BUMP",
        }
        result = route_triage(state)
        assert result == "chunker", f"Expected chunker but got {result}"
