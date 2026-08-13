from typing import TypedDict, List, Any, Optional


class AgentState(TypedDict, total=False):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    is_cached: bool
