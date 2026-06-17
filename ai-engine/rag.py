import os
import uuid
import chromadb
from chromadb.config import Settings
from embeddings import embed_texts, get_embedding_dimension

_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "reposage_code_chunks")
_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

_client = None
_collection = None


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=_PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def _get_collection():
    global _collection
    if _collection is None:
        client = _get_client()
        try:
            _collection = client.get_collection(_COLLECTION_NAME)
        except ValueError:
            _collection = client.create_collection(
                _COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
    return _collection


def ingest_chunks(
    chunks: list[str],
    metadatas: list[dict],
    ids: list[str],
) -> int:
    collection = _get_collection()
    embeddings = embed_texts(chunks)
    collection.add(
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
        ids=ids,
    )
    return len(chunks)


def get_collection_stats() -> dict:
    collection = _get_collection()
    count = collection.count()
    return {
        "collection": _COLLECTION_NAME,
        "chunk_count": count,
        "embedding_dimension": get_embedding_dimension(),
    }
