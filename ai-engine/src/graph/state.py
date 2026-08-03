from typing import TypedDict, List, Any


class AgentState(TypedDict):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    security_flag: bool
    security_reason: str

