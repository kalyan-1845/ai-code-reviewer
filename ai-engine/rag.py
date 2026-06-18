import os
import uuid
import chromadb
from chromadb.config import Settings
from embeddings import embed_texts, get_embedding_dimension

_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "reposage_code_chunks")
_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
_CHROMA_HOST = os.getenv("CHROMA_HOST", "")
_CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))

_client = None
_collection = None


def _get_client() -> chromadb.ClientAPI:
    global _client
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


def query_chunks(query_text: str, n_results: int = 5) -> list[dict]:
    collection = _get_collection()
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


def get_collection_stats() -> dict:
    collection = _get_collection()
    count = collection.count()
    return {
        "collection": _COLLECTION_NAME,
        "chunk_count": count,
        "embedding_dimension": get_embedding_dimension(),
    }
