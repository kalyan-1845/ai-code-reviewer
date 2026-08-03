from typing import TypedDict, List, Any, Optional


class AgentState(TypedDict, total=False):
    raw_diff: str
    chunks: List[str]
    current_index: int
    micro_reviews: List[str]
    final_review: str
    pr_category: str
    is_trivial: bool
    modified_files: List[str]
    file_paths: List[str]
    commit_messages: List[str]

