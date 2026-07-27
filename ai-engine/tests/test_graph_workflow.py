import sys
import os

# Add root directory and ai-engine directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.graph.state import AgentState
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node
from src.graph.workflow import route_reviewer, build_graph


def test_agent_state_types():
    state: AgentState = {
        "raw_diff": "diff --git a/file.py b/file.py\n+print('hello')",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    assert state["raw_diff"].startswith("diff --git")


def test_chunker_node():
    raw_diff = "diff --git a/file1.py b/file1.py\n+x = 1\ndiff --git a/file2.py b/file2.py\n+y = 2"
    state: AgentState = {
        "raw_diff": raw_diff,
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    res = chunker_node(state)
    assert len(res["chunks"]) == 2
    assert res["current_index"] == 0
    assert res["micro_reviews"] == []


def test_reviewer_node():
    state: AgentState = {
        "raw_diff": "",
        "chunks": ["chunk 1", "chunk 2"],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    res1 = reviewer_node(state)
    assert len(res1["micro_reviews"]) == 1
    assert res1["current_index"] == 1

    state["current_index"] = 1
    state["micro_reviews"] = res1["micro_reviews"]
    res2 = reviewer_node(state)
    assert len(res2["micro_reviews"]) == 2
    assert res2["current_index"] == 2


def test_synthesizer_node():
    state: AgentState = {
        "raw_diff": "",
        "chunks": ["chunk 1"],
        "current_index": 1,
        "micro_reviews": ["Review 1", "Review 2"],
        "final_review": ""
    }
    res = synthesizer_node(state)
    assert res["final_review"] == "Review 1\n\nReview 2"


def test_route_reviewer():
    state1: AgentState = {
        "raw_diff": "",
        "chunks": ["chunk 1", "chunk 2"],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    assert route_reviewer(state1) == "reviewer"

    state2: AgentState = {
        "raw_diff": "",
        "chunks": ["chunk 1", "chunk 2"],
        "current_index": 2,
        "micro_reviews": [],
        "final_review": ""
    }
    assert route_reviewer(state2) == "synthesizer"


def test_build_graph_execution():
    graph = build_graph()
    initial_state = {
        "raw_diff": "diff --git a/a.py b/a.py\n+a = 1\ndiff --git a/b.py b/b.py\n+b = 2",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    output = graph.invoke(initial_state)
    assert "final_review" in output
    assert len(output["micro_reviews"]) == 2
    assert output["current_index"] == 2
