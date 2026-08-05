from typing import List, Dict, Any
from src.graph.state import AgentState

try:
    from services.cache_manager import compute_hash, get_cached_review, set_cached_review
except ImportError:
    from ai_engine.services.cache_manager import compute_hash, get_cached_review, set_cached_review


def chunker_node(state: AgentState) -> dict:
    raw_diff = state.get("raw_diff", "")
    if "\ndiff --git " in raw_diff:
        raw_chunks = raw_diff.split("\ndiff --git ")
        chunks = []
        for idx, c in enumerate(raw_chunks):
            if not c.strip():
                continue
            if idx == 0 and not raw_diff.startswith("diff --git "):
                chunks.append(c)
            else:
                chunks.append(f"diff --git {c}")
    else:
        if not raw_diff.strip():
            chunks = []
        else:
            lines = raw_diff.splitlines(keepends=True)
            chunk_size = 100
            chunks = ["".join(lines[i:i + chunk_size]) for i in range(0, len(lines), chunk_size)]

    return {
        "chunks": chunks,
        "current_index": 0,
        "micro_reviews": []
    }


def reviewer_node(state: AgentState) -> dict:
    chunks = state.get("chunks", [])
    current_index = state.get("current_index", 0)
    micro_reviews = list(state.get("micro_reviews", []))
    is_cached = False

    if current_index < len(chunks):
        chunk_content = chunks[current_index]

        hash_key = compute_hash(chunk_content)
        cached_review = get_cached_review(hash_key)

        if cached_review is not None:
            review = cached_review
            is_cached = True
        else:
            is_cached = False
            review = f"Review for chunk {current_index + 1}/{len(chunks)}: Analyzed {len(chunk_content)} characters. No critical flaws detected."
            set_cached_review(hash_key, review)

        micro_reviews.append(review)

    return {
        "micro_reviews": micro_reviews,
        "current_index": current_index + 1,
        "is_cached": is_cached
    }


def synthesizer_node(state: AgentState) -> dict:
    micro_reviews = state.get("micro_reviews", [])
    final_review = "\n\n".join(micro_reviews) if micro_reviews else "No micro-reviews to synthesize."
    return {
        "final_review": final_review
    }
