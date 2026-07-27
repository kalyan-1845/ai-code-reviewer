from typing import TypedDict, List, Any


class AgentState(TypedDict):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    dependency_context: str
    github_repo: str
