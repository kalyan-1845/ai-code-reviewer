from __future__ import annotations

import logging
from typing import List, Dict, Any

from src.graph.state import AgentState

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Existing nodes — unchanged
# ---------------------------------------------------------------------------

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


def reviewer_node(state: AgentState, cache_manager=None) -> dict:
    chunks = state.get("chunks", [])
    current_index = state.get("current_index", 0)
    micro_reviews = list(state.get("micro_reviews", []))

    if cache_manager is None:
        try:
            from services.cache_manager import default_cache_manager
            cache_manager = default_cache_manager
        except Exception as exc:
            logger.warning("reviewer_node: cache_manager import failed: %s", exc)
            cache_manager = None

    if current_index < len(chunks):
        chunk_content = chunks[current_index]
        chunk_hash = cache_manager.normalize_and_hash(chunk_content) if cache_manager else ""
        
        cached_review = cache_manager.get_cached_review(chunk_hash) if (cache_manager and chunk_hash) else None
        
        if cached_review:
            logger.info("reviewer_node: Cache HIT for chunk hash %s", chunk_hash[:8])
            review = cached_review
        else:
            # Simulated micro-review step for chunk (or LLM call)
            review = f"Micro-review for chunk {current_index + 1}/{len(chunks)}:\nAnalyzed snippet ({len(chunk_content)} chars). No critical flaws detected."
            if cache_manager and chunk_hash:
                cache_manager.set_cached_review(chunk_hash, review)

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


# ---------------------------------------------------------------------------
# New nodes — Issue #3188: AST chunking + vector retrieval
# ---------------------------------------------------------------------------

def ast_chunker_node(state: AgentState) -> dict:
    """
    Parse the raw diff / code content into semantic AST chunks using
    ``services.ast_chunker.chunk_code``.

    The node treats the entire ``raw_diff`` as a single pseudo-file named
    ``"review.diff"`` so the fallback line-splitter always activates for raw
    diffs.  In a future extension, callers can pass individual file contents
    via ``state["files"]`` and this node will chunk each one with full AST
    support.

    On any failure the node logs a warning and returns an empty ``ast_chunks``
    list — the rest of the pipeline continues unaffected.
    """
    raw_diff: str = state.get("raw_diff", "")
    ast_chunks: List[Dict[str, Any]] = []

    if raw_diff and raw_diff.strip():
        try:
            from services.ast_chunker import chunk_code  # local import keeps module optional
            ast_chunks = chunk_code(
                file_name="review.diff",
                content=raw_diff,
            )
        except Exception as exc:
            logger.warning("ast_chunker_node: AST chunking failed, continuing: %s", exc)

    return {"ast_chunks": ast_chunks}


def vector_retriever_node(state: AgentState) -> dict:
    """
    Store the AST chunks produced by ``ast_chunker_node`` into an ephemeral
    ChromaDB collection and retrieve the top-5 semantically closest chunks to
    the raw diff query.

    The retrieved context is written to ``state["retrieved_context"]`` so the
    ``synthesizer_node`` (or future LLM node) can inject it as additional
    grounding information.

    On any failure the node logs a warning and returns an empty
    ``retrieved_context`` list — the rest of the pipeline continues
    unaffected.
    """
    ast_chunks: List[Dict[str, Any]] = state.get("ast_chunks") or []
    raw_diff: str = state.get("raw_diff", "")
    retrieved_context: List[Dict[str, Any]] = []

    if ast_chunks and raw_diff:
        try:
            from services.vector_store import store_chunks, retrieve_top_k, clear_collection  # local import

            collection_name = "ast-review-session"
            # Clear any stale data from a previous invocation in the same process
            clear_collection(collection_name)

            stored = store_chunks(ast_chunks, collection_name=collection_name)
            logger.debug("vector_retriever_node: stored %d AST chunks", stored)

            if stored > 0:
                retrieved_context = retrieve_top_k(
                    query=raw_diff,
                    collection_name=collection_name,
                    k=5,
                )
                logger.debug(
                    "vector_retriever_node: retrieved %d context chunks",
                    len(retrieved_context),
                )
        except Exception as exc:
            logger.warning("vector_retriever_node: retrieval failed, continuing: %s", exc)

    return {"retrieved_context": retrieved_context}


# ---------------------------------------------------------------------------
# New nodes — Issue #3191: Adaptive Model Router
# ---------------------------------------------------------------------------

def model_router_node(state: AgentState) -> dict:
    """
    Evaluate payload complexity C = diff_lines * cyclomatic_weight and select
    the optimal model endpoint (gemma, llama3, or deepseek).
    """
    try:
        from nodes.model_router import model_router_node as _router
        return _router(state)
    except Exception as exc:
        logger.warning("model_router_node failed, defaulting to llama-3.3-70b-versatile: %s", exc)
        return {
            "complexity_score": 0.0,
            "selected_model": "llama-3.3-70b-versatile",
        }

