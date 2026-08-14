import sys
import os

# Add ai-engine directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.graph.state import AgentState
from nodes.triage_node import triage_router, trivial_approval_node
from graphs.review_pipeline import build_graph


def test_triage_router_docs_pr():
    state: AgentState = {
        "modified_files": ["README.md", "docs/setup.md"],
        "commit_messages": ["docs: update installation instructions"],
        "raw_diff": "diff --git a/README.md b/README.md\n+Updated docs"
    }
    res = triage_router(state)
    assert res["pr_category"] == "DOCS"
    assert res["is_trivial"] is True


def test_triage_router_dependency_bump_pr():
    state: AgentState = {
        "modified_files": ["requirements.txt", "poetry.lock"],
        "commit_messages": ["chore: bump dependencies"],
        "raw_diff": ""
    }
    res = triage_router(state)
    assert res["pr_category"] == "DEPENDENCY_BUMP"
    assert res["is_trivial"] is True


def test_triage_router_dependency_pure_pin_change_stays_trivial():
    state: AgentState = {
        "modified_files": ["package-lock.json"],
        "commit_messages": ["chore: re-pin lockfile hashes"],
        "raw_diff": (
            'diff --git a/package-lock.json b/package-lock.json\n'
            '-    "integrity": "sha512-oldhash",\n'
            '+    "integrity": "sha512-newhash",\n'
            '-    sha256 abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\n'
            '+    sha256 fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210\n'
        )
    }
    res = triage_router(state)
    assert res["pr_category"] == "DEPENDENCY_BUMP"
    assert res["is_trivial"] is True


def test_triage_router_dependency_bump_version_change_not_trivial():
    state: AgentState = {
        "modified_files": ["requirements.txt"],
        "commit_messages": ["chore: bump dependencies"],
        "raw_diff": "diff --git a/requirements.txt b/requirements.txt\n-requests==2.28.0\n+requests==2.28.1"
    }
    res = triage_router(state)
    assert res["pr_category"] == "DEPENDENCY_BUMP"
    assert res["is_trivial"] is False


def test_triage_router_dependency_resolution_url_change_not_trivial():
    state: AgentState = {
        "modified_files": ["package-lock.json"],
        "commit_messages": ["chore: update dependency"],
        "raw_diff": (
            'diff --git a/package-lock.json b/package-lock.json\n'
            '-  "resolved": "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",\n'
            '+  "resolved": "https://evil.example/foo-1.0.0.tgz",\n'
        )
    }
    res = triage_router(state)
    assert res["pr_category"] == "DEPENDENCY_BUMP"
    assert res["is_trivial"] is False


def test_trivial_approval_node_rejects_planted_secret():
    state: AgentState = {
        "modified_files": ["requirements.txt"],
        "raw_diff": "diff --git a/requirements.txt b/requirements.txt\n+API_KEY = \"abcdefghijklmnop123\""
    }
    result = trivial_approval_node(state)
    assert result["final_review"] != "LGTM - Trivial Change Bypassed Heavy Review"
    assert "SECURITY ALERT" in result["final_review"]
    assert result["has_leaked_secrets"] is True
    assert "API_KEY" in result["detected_secrets"]



def test_triage_router_trivial_pr():
    state: AgentState = {
        "modified_files": [".gitignore"],
        "commit_messages": ["chore: ignore temp files"],
        "raw_diff": ""
    }
    res = triage_router(state)
    assert res["pr_category"] == "TRIVIAL"
    assert res["is_trivial"] is True


def test_triage_router_core_logic_pr():
    state: AgentState = {
        "modified_files": ["ai-engine/app.py", "ai-engine/extractor.py"],
        "commit_messages": ["feat: add new feature"],
        "raw_diff": "diff --git a/ai-engine/app.py b/ai-engine/app.py\n+def new_func():\n+    pass\n+def another_func():\n+    pass"
    }
    res = triage_router(state)
    assert res["pr_category"] == "CORE_LOGIC"
    assert res["is_trivial"] is False


def test_workflow_trivial_short_circuit():
    graph = build_graph()
    initial_state: AgentState = {
        "modified_files": ["README.md"],
        "commit_messages": ["docs: fix typo"],
        "raw_diff": "diff --git a/README.md b/README.md\n+Fix typo",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    output = graph.invoke(initial_state)
    assert output["pr_category"] == "DOCS"
    assert output["is_trivial"] is True
    assert output["final_review"] == "LGTM - Trivial Change Bypassed Heavy Review"


def test_workflow_core_logic_full_review():
    graph = build_graph()
    initial_state: AgentState = {
        "modified_files": ["main.py"],
        "commit_messages": ["feat: update main logic"],
        "raw_diff": "diff --git a/main.py b/main.py\n+x = 100\ndiff --git a/utils.py b/utils.py\n+y = 200",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    output = graph.invoke(initial_state)
    assert output["pr_category"] == "CORE_LOGIC"
    assert output["is_trivial"] is False
    assert "final_review" in output
    assert "LGTM - Trivial Change Bypassed Heavy Review" not in output["final_review"]


def test_trivial_approval_node_returns_correct_review_message():
    """trivial_approval_node should return the correct LGTM message."""
    result = trivial_approval_node({})
    assert "final_review" in result
    assert result["final_review"] == "LGTM - Trivial Change Bypassed Heavy Review"


def test_trivial_approval_node_ignores_input_state():
    """trivial_approval_node should return the same result regardless of input state."""
    state1: AgentState = {"modified_files": ["README.md"]}
    state2: AgentState = {"modified_files": ["docs/guide.md"], "commit_messages": ["docs: update"]}
    state3: AgentState = {}
    r1 = trivial_approval_node(state1)
    r2 = trivial_approval_node(state2)
    r3 = trivial_approval_node(state3)
    assert r1 == r2 == r3


def test_trivial_approval_node_returns_dict():
    """trivial_approval_node should return a dict."""
    result = trivial_approval_node({})
    assert isinstance(result, dict)


def test_trivial_approval_node_only_sets_final_review():
    """trivial_approval_node should only set the final_review key."""
    result = trivial_approval_node({"some_key": "some_value"})
    assert result == {"final_review": "LGTM - Trivial Change Bypassed Heavy Review"}
