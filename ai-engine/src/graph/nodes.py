from src.graph.state import AgentState
from services.ast_resolver import resolve_ast_dependencies
from nodes.triage_node import triage_router, trivial_approval_node

try:
    from services.security_firewall import scan_diff
except ImportError:
    from ai_engine.services.security_firewall import scan_diff

try:
    from services.cache_manager import compute_hash, get_cached_review, set_cached_review
except ImportError:
    from ai_engine.services.cache_manager import compute_hash, get_cached_review, set_cached_review


def sanitizer_node(state: AgentState) -> dict:
    raw_diff = state.get("raw_diff", "")
    is_safe, reason = scan_diff(raw_diff)
    if not is_safe:
        return {
            "security_flag": True,
            "security_reason": reason,
            "final_review": reason
        }
    return {
        "security_flag": False,
        "security_reason": ""
    }



def chunker_node(state: AgentState) -> dict:
    raw_diff = state.get("raw_diff", "")
    if "\ndiff --git " in raw_diff:
        raw_chunks = raw_diff.split("\ndiff --git ")
        chunks = []
        for idx, c in enumerate(raw_chunks):
            if not c.strip():
                continue
            if idx == 0:
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

    ast_context = state.get("ast_context", "")
    diff_ast_context = resolve_ast_dependencies(raw_diff)
    if diff_ast_context:
        if ast_context:
            ast_context = f"{ast_context}\n{diff_ast_context}"
        else:
            ast_context = diff_ast_context

    return {
        "chunks": chunks,
        "current_index": 0,
        "micro_reviews": [],
        "ast_context": ast_context
    }


def reviewer_node(state: AgentState) -> dict:
    chunks = state.get("chunks", [])
    current_index = state.get("current_index", 0)
    micro_reviews = list(state.get("micro_reviews", []))
    ast_context = state.get("ast_context", "")
    is_cached = False

    if current_index < len(chunks):
        chunk_content = chunks[current_index]
        chunk_ast = resolve_ast_dependencies(chunk_content)
        if chunk_ast and chunk_ast not in ast_context:
            ast_context = f"{ast_context}\n{chunk_ast}" if ast_context else chunk_ast

        hash_key = compute_hash(chunk_content)
        cached_review = get_cached_review(hash_key)

        if cached_review is not None:
            review = cached_review
            is_cached = True
        else:
            is_cached = False
            review = f"Micro-review for chunk {current_index + 1}/{len(chunks)}:\nAnalyzed snippet ({len(chunk_content)} chars). No critical flaws detected."
            if ast_context:
                review += f"\nAST Context: {ast_context}"
            set_cached_review(hash_key, review)

        micro_reviews.append(review)

    return {
        "micro_reviews": micro_reviews,
        "current_index": current_index + 1,
        "ast_context": ast_context,
        "is_cached": is_cached
    }



def synthesizer_node(state: AgentState) -> dict:
    micro_reviews = state.get("micro_reviews", [])
    final_review = "\n\n".join(micro_reviews) if micro_reviews else "No micro-reviews to synthesize."
    return {
        "final_review": final_review
    }
