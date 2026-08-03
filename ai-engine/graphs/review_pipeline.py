from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import chunker_node, reviewer_node, synthesizer_node, sanitizer_node
from nodes.triage_node import triage_router, trivial_approval_node
from nodes.secret_scrubber_node import secret_scrubber_node
try:
    from nodes.knowledge_retriever_node import knowledge_retriever_node
except ImportError:
    from ai_engine.nodes.knowledge_retriever_node import knowledge_retriever_node

def route_sanitizer(state: AgentState) -> str:
    if state.get("security_flag", False):
        return END
    return "triage"

def route_triage(state: AgentState) -> str:
    if state.get("is_trivial", False):
        return "trivial_approval"
    return "chunker"

def route_reviewer(state: AgentState) -> str:
    if state.get("current_index", 0) < len(state.get("chunks", [])):
        return "reviewer"
    return "synthesizer"

def build_graph():
    """
    Builds the review pipeline LangGraph workflow.
    """
    builder = StateGraph(AgentState)

    builder.add_node("sanitizer", sanitizer_node)
    builder.add_node("triage", triage_router)
    builder.add_node("trivial_approval", trivial_approval_node)
    builder.add_node("chunker", chunker_node)
    builder.add_node("secret_scrubber", secret_scrubber_node)
    builder.add_node("knowledge_retriever", knowledge_retriever_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "sanitizer")

    builder.add_conditional_edges(
        "sanitizer",
        route_sanitizer,
        {
            "triage": "triage",
            END: END
        }
    )

    builder.add_conditional_edges(
        "triage",
        route_triage,
        {
            "trivial_approval": "trivial_approval",
            "chunker": "chunker"
        }
    )

    builder.add_edge("trivial_approval", END)
    builder.add_edge("chunker", "secret_scrubber")
    builder.add_edge("secret_scrubber", "knowledge_retriever")
    builder.add_edge("knowledge_retriever", "reviewer")

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

# Also alias to build_review_pipeline for compatibility with main branch's tests
build_review_pipeline = build_graph
