from typing import TypedDict, List, Any


class AgentState(TypedDict, total=False):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    dependency_context: str
    github_repo: str
    is_malicious: bool
    security_reason: str
