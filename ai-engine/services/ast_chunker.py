"""
services/ast_chunker.py
~~~~~~~~~~~~~~~~~~~~~~~
AST-aware semantic chunker for the RepoSage AI Engine.

Uses ``tree-sitter-languages`` to parse source files along their natural
AST boundaries (functions, classes, methods) rather than arbitrary
character/line counts.  Falls back gracefully to the existing
``text_splitter.split_file_content`` whenever:
- The file extension is not supported by tree-sitter.
- Parsing raises any exception (malformed code, encoding issues, etc.).
- The extracted AST nodes are too few to be useful.

Public API
----------
chunk_code(file_name, content, repo_url=None) -> list[dict]
    Return a list of chunk dicts compatible with the rest of the RAG
    pipeline.  Each dict has the shape::

        {
            "chunk_id":  str,          # deterministic sha256 prefix
            "content":   str,          # raw source text of the node
            "metadata": {
                "source_file": str,
                "fileName":    str,
                "chunk_index": int,
                "total_chunks": int,
                "language":    str,
                "node_type":   str,    # e.g. "function_definition"
                "start_line":  int,    # 0-based, matches tree-sitter convention
                "end_line":    int,
                "chunker":     str,    # "ast" | "fallback"
                "repoUrl":     str,    # only when repo_url is provided
            }
        }
"""

from __future__ import annotations

import hashlib
import os
from typing import Optional

# ---------------------------------------------------------------------------
# tree-sitter imports — soft-fail so the module can be imported even when the
# package is not installed (unit tests mock it out in that scenario).
# ---------------------------------------------------------------------------
try:
    from tree_sitter_languages import get_language, get_parser  # type: ignore
    _TS_AVAILABLE = True
except Exception:  # ImportError or anything else at import time
    _TS_AVAILABLE = False
    get_language = None  # type: ignore
    get_parser = None    # type: ignore

# ---------------------------------------------------------------------------
# Fallback: reuse the existing character/line splitter from text_splitter.py
# ---------------------------------------------------------------------------
from text_splitter import split_file_content as _fallback_split

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB — mirrors text_splitter guard
_MAX_CHUNKS_PER_FILE = int(os.getenv("MAX_CHUNKS_PER_FILE", "500"))

# Map file extension → tree-sitter language identifier.
# The identifiers are those accepted by tree_sitter_languages.get_language().
_EXT_TO_TS_LANG: dict[str, str] = {
    ".py":   "python",
    ".js":   "javascript",
    ".jsx":  "javascript",
    ".ts":   "typescript",
    ".tsx":  "tsx",
    ".java": "java",
    ".go":   "go",
    ".rs":   "rust",
    ".c":    "c",
    ".cpp":  "cpp",
    ".cc":   "cpp",
    ".h":    "c",
    ".hpp":  "cpp",
}

# Map tree-sitter language identifier → the node *types* we want to extract as
# top-level semantic chunks.  Only direct children of the root are considered
# so that we never double-count nested methods inside a class body.
_LANG_NODE_TYPES: dict[str, set[str]] = {
    "python": {
        "function_definition",
        "class_definition",
        "decorated_definition",
    },
    "javascript": {
        "function_declaration",
        "class_declaration",
        "export_statement",
        "lexical_declaration",   # const fn = () => …
        "variable_declaration",  # var fn = function …
    },
    "typescript": {
        "function_declaration",
        "class_declaration",
        "export_statement",
        "interface_declaration",
        "type_alias_declaration",
        "lexical_declaration",
    },
    "tsx": {
        "function_declaration",
        "class_declaration",
        "export_statement",
        "lexical_declaration",
    },
    "java": {
        "class_declaration",
        "interface_declaration",
        "method_declaration",
        "constructor_declaration",
    },
    "go": {
        "function_declaration",
        "method_declaration",
        "type_declaration",
    },
    "rust": {
        "function_item",
        "impl_item",
        "struct_item",
        "enum_item",
        "trait_item",
        "mod_item",
    },
    "c": {
        "function_definition",
        "struct_specifier",
        "enum_specifier",
    },
    "cpp": {
        "function_definition",
        "class_specifier",
        "struct_specifier",
        "namespace_definition",
    },
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_chunk_id(file_name: str, chunk_index: int) -> str:
    """Deterministic 16-char hex ID matching the existing text_splitter scheme."""
    raw = f"{file_name}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _detect_ts_language(file_name: str) -> Optional[str]:
    """Return the tree-sitter language identifier for *file_name*, or None."""
    ext = os.path.splitext(file_name)[1].lower()
    return _EXT_TO_TS_LANG.get(ext)


def _extract_ast_nodes(
    file_name: str,
    content: str,
    ts_lang: str,
) -> list[dict]:
    """
    Parse *content* with tree-sitter and return one dict per top-level
    semantic node (function, class, etc.).

    Returns an empty list on any parsing failure so callers can trigger
    the fallback path.
    """
    if not _TS_AVAILABLE:
        return []

    try:
        parser = get_parser(ts_lang)
        tree = parser.parse(content.encode("utf-8"))
    except Exception:
        return []

    target_types = _LANG_NODE_TYPES.get(ts_lang, set())
    if not target_types:
        return []

    content_bytes = content.encode("utf-8")
    nodes: list[dict] = []

    for child in tree.root_node.children:
        node_type = child.type

        # For Python decorated definitions, look at the inner node type too
        actual_type = node_type
        if node_type == "decorated_definition":
            inner = next(
                (c for c in child.children if c.type in target_types),
                None,
            )
            if inner:
                actual_type = inner.type

        if node_type not in target_types:
            continue

        try:
            chunk_text = content_bytes[
                child.start_byte: child.end_byte
            ].decode("utf-8", errors="replace")
        except Exception:
            continue

        if not chunk_text.strip():
            continue

        nodes.append({
            "content":    chunk_text,
            "node_type":  actual_type,
            "start_line": child.start_point[0],   # 0-based row
            "end_line":   child.end_point[0],
        })

    return nodes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def chunk_code(
    file_name: str,
    content: str,
    repo_url: Optional[str] = None,
) -> list[dict]:
    """
    Split *content* into semantic AST chunks.

    Parameters
    ----------
    file_name : str
        Path / name of the source file (used for language detection and IDs).
    content : str
        Raw source text.
    repo_url : str, optional
        Repository URL attached to chunk metadata (for downstream filtering).

    Returns
    -------
    list[dict]
        Chunk dicts with ``chunk_id``, ``content``, and ``metadata``.
        Returns ``[]`` for empty or oversized files.
    """
    # --- Guard rails (mirrors text_splitter) --------------------------------
    if not content or not content.strip():
        return []
    if len(content) > _MAX_FILE_SIZE:
        return []

    # --- Attempt AST chunking -----------------------------------------------
    ts_lang = _detect_ts_language(file_name)
    raw_nodes: list[dict] = []

    if ts_lang and _TS_AVAILABLE:
        raw_nodes = _extract_ast_nodes(file_name, content, ts_lang)

    # --- Fallback if AST yielded nothing useful ------------------------------
    if not raw_nodes:
        fallback_chunks = _fallback_split(
            file_name=file_name,
            content=content,
            repo_url=repo_url,
        )
        # Tag them so callers can tell the chunker path used
        for chunk in fallback_chunks:
            chunk["metadata"]["chunker"] = "fallback"
            chunk["metadata"].setdefault("node_type", "text_block")
        return fallback_chunks

    # --- Build output list from AST nodes -----------------------------------
    capped = raw_nodes[:_MAX_CHUNKS_PER_FILE]
    total = len(capped)
    results: list[dict] = []

    for i, node in enumerate(capped):
        metadata: dict = {
            "source_file": file_name,
            "fileName":    file_name,
            "chunk_index": i,
            "total_chunks": total,
            "language":    ts_lang,
            "node_type":   node["node_type"],
            "start_line":  node["start_line"],
            "end_line":    node["end_line"],
            "chunker":     "ast",
        }
        if repo_url:
            metadata["repoUrl"] = repo_url

        results.append({
            "chunk_id": _generate_chunk_id(file_name, i),
            "content":  node["content"],
            "metadata": metadata,
        })

    return results
