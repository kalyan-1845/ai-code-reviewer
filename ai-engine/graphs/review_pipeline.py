from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node
from nodes.triage_node import triage_router, trivial_approval_node


def route_triage(state: AgentState) -> str:
    if state.get("is_trivial", False):
        return "trivial_approval"
    return "chunker"


def route_reviewer(state: AgentState) -> str:
    if state.get("current_index", 0) < len(state.get("chunks", [])):
        return "reviewer"
    return "synthesizer"


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("triage", triage_router)
    builder.add_node("trivial_approval", trivial_approval_node)
    builder.add_node("chunker", chunker_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "triage")

    builder.add_conditional_edges(
        "triage",
        route_triage,
        {
            "trivial_approval": "trivial_approval",
            "chunker": "chunker"
        }
    )

    builder.add_edge("trivial_approval", END)
    builder.add_edge("chunker", "reviewer")

    builder.add_conditional_edges(
        "reviewer",
        route_reviewer,
        {
            "reviewer": "reviewer",
            "synthesizer": "synthesizer"
        }
    )

    builder.add_edge("synthesizer", END)

    return builder.compile()
