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
_CHROMA_API_KEY = os.getenv("CHROMA_API_KEY", "")
_CHROMA_AUTH_PROVIDER = os.getenv("CHROMA_AUTH_PROVIDER", "")
_MAX_INGEST_CHUNKS = int(os.getenv("MAX_INGEST_CHUNKS", "500"))

_client = None
_client_lock = threading.Lock()


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                if _CHROMA_HOST:
                    settings_dict = {"anonymized_telemetry": False}
                    if _CHROMA_AUTH_PROVIDER and _CHROMA_API_KEY:
                        settings_dict["chroma_client_auth_provider"] = _CHROMA_AUTH_PROVIDER
                        settings_dict["chroma_client_auth_credentials"] = _CHROMA_API_KEY
                    _client = chromadb.HttpClient(
                        host=_CHROMA_HOST,
                        port=_CHROMA_PORT,
                        settings=Settings(**settings_dict),
                    )
                else:
                    _client = chromadb.PersistentClient(
                        path=_PERSIST_DIR,
                        settings=Settings(anonymized_telemetry=False),
                    )
    return _client


def _collection_name(repo_url: Optional[str] = None) -> str:
    if repo_url:
        suffix = hashlib.sha256(repo_url.encode()).hexdigest()[:12]
        return f"{_COLLECTION_NAME}_{suffix}"
    return _COLLECTION_NAME


def _get_collection(repo_url: Optional[str] = None):
    client = _get_client()
    name = _collection_name(repo_url)
    return client.get_or_create_collection(
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
    chunks = chunks[:_MAX_INGEST_CHUNKS]
    metadatas = metadatas[:_MAX_INGEST_CHUNKS]
    ids = ids[:_MAX_INGEST_CHUNKS]
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
    count = collection.count()
    if count == 0:
        return []
    n_results = min(n_results, count)
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
    collection = _get_collection(repo_url)
    results = collection.get(where={"source_file": file_path})
    ids_to_delete = results.get("ids", [])
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
    return len(ids_to_delete)


def cleanup_stale_chunks(current_files: set, repo_url: Optional[str] = None) -> dict:
    collection = _get_collection(repo_url)
    stored_paths = set()
    offset = 0
    while True:
        batch = collection.get(limit=_MAX_INGEST_CHUNKS, offset=offset, include=["metadatas"])
        metadatas = batch.get("metadatas") or []
        if not metadatas:
            break
        stored_paths.update(m.get("source_file") for m in metadatas if m and m.get("source_file"))
        offset += len(metadatas)
    stale_paths = stored_paths - current_files
    removed_count = 0
    for stale_path in stale_paths:
        removed_count += delete_chunks_for_file(stale_path, repo_url=repo_url)
    return {
        "stale_paths": list(stale_paths),
        "removed_count": removed_count,
        "remaining_count": collection.count(),
    }


def upsert_chunks(
    chunks: list[str],
    metadatas: list[dict],
    ids: list[str],
    repo_url: Optional[str] = None,
) -> int:
    if not chunks:
        return 0
    if not (len(chunks) == len(metadatas) == len(ids)):
        raise ValueError("chunks, metadatas, and ids must have the same length")
    chunks = chunks[:_MAX_INGEST_CHUNKS]
    metadatas = metadatas[:_MAX_INGEST_CHUNKS]
    ids = ids[:_MAX_INGEST_CHUNKS]
    collection = _get_collection(repo_url)
    embeddings = embed_texts(chunks)
    collection.upsert(
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    return len(chunks)


def delete_repo_chunks(repo_url: str) -> int:
    collection = _get_collection(repo_url)
    total = 0
    while True:
        batch = collection.get(limit=_MAX_INGEST_CHUNKS, include=[])
        ids = batch.get("ids", [])
        if not ids:
            break
        collection.delete(ids=ids)
        total += len(ids)
    return total


def delete_collection(repo_url: str) -> bool:
    client = _get_client()
    name = _collection_name(repo_url)
    try:
        client.delete_collection(name)
        return True
    except ValueError:
        return False
