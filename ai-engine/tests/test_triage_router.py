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
