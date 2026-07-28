from typing import TypedDict, List, Dict, Any, Optional


class AgentState(TypedDict, total=False):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    # AST chunking pipeline additions (Issue #3188)
    ast_chunks: List[Dict[str, Any]]       # semantic AST nodes from ast_chunker_node
    retrieved_context: List[Dict[str, Any]] # top-k matches from vector_retriever_node
