import os
import chromadb
from chromadb.config import Settings
from embeddings import embed_texts

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


def query_similar(query_text: str, n_results: int = 5) -> list[dict]:
    collection = _get_collection()
    query_embedding = embed_texts([query_text])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
    )
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    output = []
    for i in range(len(documents)):
        output.append({
            "text": documents[i],
            "metadata": metadatas[i] if i < len(metadatas) else {},
            "score": 1.0 - distances[i] if i < len(distances) else 0.0,
        })
    return output


def get_collection_stats() -> dict:
    collection = _get_collection()
    count = collection.count()
    return {
        "collection": _COLLECTION_NAME,
        "chunk_count": count,
        "embedding_dimension": 384,
    }
