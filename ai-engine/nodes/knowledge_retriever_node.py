from typing import Dict, Any
from src.graph.state import AgentState

try:
    from services.rag_service import retrieve_historical_context
except ImportError:
    from ai_engine.services.rag_service import retrieve_historical_context


def knowledge_retriever_node(state: AgentState) -> Dict[str, Any]:
    """
    LangGraph node that queries the RAG service for historical repository conventions
    and past maintainer decisions relevant to the current PR diff.
    Updates AgentState with retrieved repository_context.
    """
    raw_diff = state.get("raw_diff", "")
    repository_context = retrieve_historical_context(raw_diff) if raw_diff else ""
    return {
        "repository_context": repository_context
    }
