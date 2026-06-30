import os
import uuid
import hashlib
import threading
from typing import Optional
import chromadb
from chromadb.config import Settings
from embeddings import embed_texts, get_embedding_dimension

_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "reposage_code_chunks")
_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
_CHROMA_HOST = os.getenv("CHROMA_HOST", "")
_CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))

_client = None
_client_lock = threading.Lock()


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                if _CHROMA_HOST:
                    _client = chromadb.HttpClient(
                        host=_CHROMA_HOST,
                        port=_CHROMA_PORT,
                        settings=Settings(anonymized_telemetry=False),
                    )
                else:
                    _client = chromadb.PersistentClient(
                        path=_PERSIST_DIR,
                        settings=Settings(anonymized_telemetry=False),
                    )
    return _client


def _collection_name(repo_url: Optional[str] = None) -> str:
    """Return a tenant-isolated collection name.

    When *repo_url* is provided, the collection is namespaced with a
    deterministic hash so that each repository's vectors live in a separate
    ChromaDB collection.  This prevents cross-user / cross-repo code snippet
    leakage (tenant isolation).

    When *repo_url* is ``None``, the base ``_COLLECTION_NAME`` is returned
    for backward compatibility.
    """
    if repo_url:
        suffix = hashlib.sha256(repo_url.encode()).hexdigest()[:12]
        return f"{_COLLECTION_NAME}_{suffix}"
    return _COLLECTION_NAME


def _get_collection(repo_url: Optional[str] = None):
    client = _get_client()
    name = _collection_name(repo_url)
    try:
        return client.get_collection(name)
    except ValueError:
        return client.create_collection(
            name,
            metadata={"hnsw:space": "cosine"},
        )


def ingest_chunks(
    chunks: list[str],
    metadatas: list[dict],
    ids: list[str],
    repo_url: Optional[str] = None,
) -> int:
    if not chunks:
        return 0
    if not (len(chunks) == len(metadatas) == len(ids)):
        raise ValueError("chunks, metadatas, and ids must have the same length")
    collection = _get_collection(repo_url)
    embeddings = embed_texts(chunks)
    collection.add(
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    return len(chunks)


def query_chunks(
    query_text: str,
    n_results: int = 5,
    repo_url: Optional[str] = None,
) -> list[dict]:
    if not query_text or not query_text.strip():
        return []
    collection = _get_collection(repo_url)
    query_embedding = embed_texts([query_text])
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=n_results,
    )
    chunks = []
    metadatas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
    documents = results.get("documents", [[]])[0] if results.get("documents") else []
    distances = results.get("distances", [[]])[0] if results.get("distances") else []
    ids = results.get("ids", [[]])[0] if results.get("ids") else []
    for i in range(len(documents)):
        chunks.append({
            "chunk_id": ids[i] if i < len(ids) else None,
            "content": documents[i],
            "metadata": metadatas[i] if i < len(metadatas) else {},
            "similarity_score": 1.0 - distances[i] if i < len(distances) else None,
        })
    return chunks


def get_collection_stats(repo_url: Optional[str] = None) -> dict:
    collection = _get_collection(repo_url)
    count = collection.count()
    return {
        "collection": _collection_name(repo_url),
        "chunk_count": count,
        "embedding_dimension": get_embedding_dimension(),
    }


def get_chunks_paginated(
    limit: int = 50,
    offset: int = 0,
    repo_url: Optional[str] = None,
) -> list[dict]:
    collection = _get_collection(repo_url)
    results = collection.get(limit=limit, offset=offset)
    chunks = []
    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])
    ids = results.get("ids", [])
    for i in range(len(documents)):
        chunks.append({
            "chunk_id": ids[i] if i < len(ids) else None,
            "content": documents[i],
            "metadata": metadatas[i] if i < len(metadatas) else {},
        })
    return chunks


def delete_chunks_for_file(file_path: str, repo_url: Optional[str] = None) -> int:
    """Remove all ChromaDB chunks whose metadata contains the given file path.

    Chunks are matched using the ``source_file`` metadata field that is set
    during ingestion (via /api/rag/split).  Returns the number of chunks that
    were deleted.
    """
    collection = _get_collection(repo_url)
    results = collection.get(where={"source_file": file_path})
    ids_to_delete = results.get("ids", [])
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
    return len(ids_to_delete)


def cleanup_stale_chunks(current_files: set, repo_url: Optional[str] = None) -> dict:
    """Remove ChromaDB chunks for any file path that is no longer in the
    provided *current_files* set.

    Returns a summary dict with ``stale_paths``, ``removed_count``, and
    ``remaining_count`` so the API response shape stays identical to the
    previous vectorstore-based implementation.
    """
    collection = _get_collection(repo_url)
    # Fetch all stored source_file values without retrieving embeddings
    all_results = collection.get(include=["metadatas"])
    stored_paths = {
        m.get("source_file")
        for m in (all_results.get("metadatas") or [])
        if m.get("source_file")
    }
    stale_paths = stored_paths - current_files
    removed_count = 0
    for stale_path in stale_paths:
        removed_count += delete_chunks_for_file(stale_path, repo_url=repo_url)
    return {
        "stale_paths": list(stale_paths),
        "removed_count": removed_count,
        "remaining_count": collection.count(),
    }


def delete_repo_chunks(repo_url: str) -> int:
    """Delete ALL chunks for a given repository.

    Removes every document in the tenant-isolated collection so that
    re-analysing the same repo replaces old chunks instead of duplicating
    them.  Returns the number of deleted chunks.
    """
    collection = _get_collection(repo_url)
    all_ids = collection.get()["ids"]
    if all_ids:
        collection.delete(ids=all_ids)
    return len(all_ids)


def delete_collection(repo_url: str) -> bool:
    """Delete a per-repo collection for cleanup on repo re-analysis."""
    client = _get_client()
    name = _collection_name(repo_url)
    try:
        client.delete_collection(name)
        return True
    except ValueError:
        return False
