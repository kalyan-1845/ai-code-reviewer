from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import sanitizer_node, chunker_node, ast_resolver_node, reviewer_node, synthesizer_node


def route_sanitizer(state: AgentState) -> str:
    if state.get("is_malicious"):
        return END
    return "chunker"


def route_reviewer(state: AgentState) -> str:
    if state.get("current_index", 0) < len(state.get("chunks", [])):
        return "reviewer"
    return "synthesizer"


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("sanitizer", sanitizer_node)
    builder.add_node("chunker", chunker_node)
    builder.add_node("ast_resolver", ast_resolver_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "sanitizer")

    builder.add_conditional_edges(
        "sanitizer",
        route_sanitizer,
        {
            END: END,
            "chunker": "chunker"
        }
    )

    builder.add_edge("chunker", "ast_resolver")
    builder.add_edge("ast_resolver", "reviewer")

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
