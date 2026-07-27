from typing import List, Dict, Any
from src.graph.state import AgentState


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
        lines = raw_diff.splitlines(keepends=True)
        chunk_size = 100
        chunks = ["".join(lines[i:i + chunk_size]) for i in range(0, len(lines), chunk_size)] if lines else [raw_diff]

    return {
        "chunks": chunks,
        "current_index": 0,
        "micro_reviews": []
    }


def reviewer_node(state: AgentState) -> dict:
    chunks = state.get("chunks", [])
    current_index = state.get("current_index", 0)
    micro_reviews = list(state.get("micro_reviews", []))

    if current_index < len(chunks):
        chunk_content = chunks[current_index]
        # Simulated micro-review step for chunk
        review = f"Micro-review for chunk {current_index + 1}/{len(chunks)}:\nAnalyzed snippet ({len(chunk_content)} chars). No critical flaws detected."
        micro_reviews.append(review)

    return {
        "micro_reviews": micro_reviews,
        "current_index": current_index + 1
    }


def synthesizer_node(state: AgentState) -> dict:
    micro_reviews = state.get("micro_reviews", [])
    final_review = "\n\n".join(micro_reviews) if micro_reviews else "No micro-reviews to synthesize."
    return {
        "final_review": final_review
    }
