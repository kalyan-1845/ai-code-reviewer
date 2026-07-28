from typing import Optional, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from src.graph.state import AgentState
from src.graph.nodes import (
    chunker_node,
    reviewer_node,
    synthesizer_node,
    ast_chunker_node,
    vector_retriever_node,
    model_router_node,
)
from src.graph.tracing import get_tracing_config, init_telemetry


def route_reviewer(state: AgentState) -> str:
    if state.get("current_index", 0) < len(state.get("chunks", [])):
        return "reviewer"
    return "synthesizer"


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("chunker", chunker_node)
    builder.add_node("ast_chunker", ast_chunker_node)
    builder.add_node("vector_retriever", vector_retriever_node)
    builder.add_node("model_router", model_router_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("synthesizer", synthesizer_node)

    builder.add_edge(START, "chunker")
    builder.add_edge("chunker", "ast_chunker")
    builder.add_edge("ast_chunker", "vector_retriever")
    builder.add_edge("vector_retriever", "model_router")
    builder.add_edge("model_router", "reviewer")

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


def invoke_graph(state: AgentState, config: Optional[Dict[str, Any]] = None, callbacks: Optional[List[Any]] = None) -> AgentState:
    """
    Invoke the compiled LangGraph workflow with automatic LangSmith & OpenTelemetry tracing callbacks.
    """
    init_telemetry()
    graph = build_graph()
    tracing_config = get_tracing_config(callbacks=callbacks)

    merged_config = dict(config or {})
    if "callbacks" in tracing_config:
        merged_callbacks = list(merged_config.get("callbacks", [])) + list(tracing_config["callbacks"])
        merged_config["callbacks"] = merged_callbacks

    return graph.invoke(state, config=merged_config if merged_config else None)
