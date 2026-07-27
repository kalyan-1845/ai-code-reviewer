from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node


def route_reviewer(state: AgentState) -> str:
    if state.get("current_index", 0) < len(state.get("chunks", [])):
        return "reviewer"
    return "synthesizer"


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("chunker", chunker_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "chunker")
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
