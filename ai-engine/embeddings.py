import os
import hashlib
import threading
import collections
from sentence_transformers import SentenceTransformer

_EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
_model = None

_MAX_CACHE_SIZE = int(os.getenv("MAX_EMBEDDING_CACHE_SIZE", "10000"))
_cache_enabled = os.getenv("EMBEDDING_CACHE_ENABLED", "true").lower() == "true"
_embedding_cache = collections.OrderedDict()
_cache_lock = threading.Lock()


def _compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_EMBEDDING_MODEL_NAME)
    return _model


def get_embedding_dimension() -> int:
    return _get_model().get_sentence_embedding_dimension()


def embed_text(text: str) -> list[float]:
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vecs = model.encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in vecs]


def get_or_compute_embedding(file_path: str, content: str) -> list[float]:
    if not _cache_enabled:
        return embed_text(content)
    content_hash = _compute_content_hash(content)
    with _cache_lock:
        cached = _embedding_cache.get(file_path)
        if cached is not None and cached["content_hash"] == content_hash:
            _embedding_cache.move_to_end(file_path)
            return cached["embedding"]
    embedding = embed_text(content)
    with _cache_lock:
        _embedding_cache[file_path] = {"content_hash": content_hash, "embedding": embedding}
        _embedding_cache.move_to_end(file_path)
        if len(_embedding_cache) > _MAX_CACHE_SIZE:
            _embedding_cache.popitem(last=False)
    return embedding


def invalidate_cache_for_file(file_path: str) -> None:
    with _cache_lock:
        _embedding_cache.pop(file_path, None)


def clear_embedding_cache() -> None:
    with _cache_lock:
        _embedding_cache.clear()


def get_cache_stats() -> dict:
    with _cache_lock:
        return {
            "enabled": _cache_enabled,
            "size": len(_embedding_cache),
            "max_size": _MAX_CACHE_SIZE,
            "keys": list(_embedding_cache.keys()),
        }
