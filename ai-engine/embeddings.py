import os
import hashlib
import math
import threading
import collections

try:
    from sentence_transformers import SentenceTransformer
except Exception as exc:
    print(f"⚠️ sentence-transformers unavailable: {exc}. Using deterministic local fallback embeddings.")
    SentenceTransformer = None

_EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
_FALLBACK_EMBEDDING_DIMENSION = 384
_model = None
_fallback_active = False

_MAX_CACHE_SIZE = int(os.getenv("MAX_EMBEDDING_CACHE_SIZE", "10000"))
_cache_enabled = os.getenv("EMBEDDING_CACHE_ENABLED", "true").lower() == "true"
_embedding_cache = collections.OrderedDict()
_cache_lock = threading.Lock()
_embedding_dimension = None


def _compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class _EmbeddingVector(list):
    def tolist(self) -> list[float]:
        return list(self)


class _DeterministicEmbeddingModel:
    def get_sentence_embedding_dimension(self) -> int:
        return _FALLBACK_EMBEDDING_DIMENSION

    def encode(self, texts, normalize_embeddings: bool = True):
        if isinstance(texts, str):
            return _EmbeddingVector(self._embed(texts, normalize_embeddings))
        return [
            _EmbeddingVector(self._embed(text, normalize_embeddings))
            for text in texts
        ]

    def _embed(self, text: str, normalize_embeddings: bool) -> list[float]:
        text_bytes = str(text).encode("utf-8")
        values = []
        counter = 0
        while len(values) < _FALLBACK_EMBEDDING_DIMENSION:
            digest = hashlib.blake2b(
                text_bytes + counter.to_bytes(4, "big"),
                digest_size=64,
            ).digest()
            values.extend((byte / 127.5) - 1.0 for byte in digest)
            counter += 1

        vector = values[:_FALLBACK_EMBEDDING_DIMENSION]
        if normalize_embeddings:
            magnitude = math.sqrt(sum(value * value for value in vector))
            if magnitude:
                vector = [value / magnitude for value in vector]
        return vector


def is_fallback_active() -> bool:
    return _fallback_active


def _get_model():
    global _model, _fallback_active
    if _model is None:
        if SentenceTransformer is None:
            _fallback_active = True
            _model = _DeterministicEmbeddingModel()
        else:
            try:
                _model = SentenceTransformer(_EMBEDDING_MODEL_NAME)
            except OSError as exc:
                print(
                    f"⚠️ Could not load embedding model '{_EMBEDDING_MODEL_NAME}': {exc}. "
                    "Using deterministic local fallback embeddings."
                )
                _fallback_active = True
                _model = _DeterministicEmbeddingModel()
            except Exception as exc:
                print(
                    f"⚠️ Embedding model '{_EMBEDDING_MODEL_NAME}' failed to initialize: {exc}. "
                    "Using deterministic local fallback embeddings."
                )
                _fallback_active = True
                _model = _DeterministicEmbeddingModel()
    return _model


def get_embedding_dimension() -> int:
    global _embedding_dimension
    if _embedding_dimension is None:
        _embedding_dimension = _get_model().get_sentence_embedding_dimension()
    return _embedding_dimension


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
        cached = _embedding_cache.get(file_path)
        if cached is not None and cached["content_hash"] == content_hash:
            return cached["embedding"]
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
