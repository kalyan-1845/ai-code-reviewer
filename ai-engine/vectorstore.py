import json
import os
import hashlib
import threading

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
VECTORS_FILE = os.path.join(DATA_DIR, "vectors.json")

os.makedirs(DATA_DIR, exist_ok=True)

_vectors = []
_vectors_lock = threading.Lock()


def _load():
    global _vectors
    try:
        if os.path.exists(VECTORS_FILE):
            with open(VECTORS_FILE, "r") as f:
                _vectors = json.load(f)
        else:
            _vectors = []
    except (json.JSONDecodeError, IOError) as exc:
        print(f"WARNING: Failed to load vectors from {VECTORS_FILE}: {exc}. Resetting to empty.")
        _vectors = []


def _save():
    tmp = VECTORS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(_vectors, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, VECTORS_FILE)


def _compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def add_vector(file_path: str, content: str, embedding: list[float], chunk_index: int = 0):
    with _vectors_lock:
        _load()
        content_hash = _compute_content_hash(content)
        entry = {
            "file_path": file_path,
            "content_hash": content_hash,
            "chunk_index": chunk_index,
            "embedding": embedding,
        }
        _vectors.append(entry)
        _save()
    return entry


def delete_vectors_for_file(file_path: str) -> int:
    global _vectors
    with _vectors_lock:
        _load()
        before = len(_vectors)
        _remaining = [v for v in _vectors if v["file_path"] != file_path]
        removed = before - len(_remaining)
        if removed > 0:
            _vectors = _remaining
            _save()
    return removed


def cleanup_stale_vectors(current_files: set[str]) -> dict:
    with _vectors_lock:
        _load()
        stored_paths = {v["file_path"] for v in _vectors}
        stale_paths = stored_paths - current_files
        removed_count = 0
        for stale_path in stale_paths:
            removed_count += delete_vectors_for_file(stale_path)
    return {
        "stale_paths": list(stale_paths),
        "removed_count": removed_count,
        "remaining_count": len(_vectors),
    }


def get_all_vectors() -> list[dict]:
    with _vectors_lock:
        _load()
        return list(_vectors)


def get_vectors_for_file(file_path: str) -> list[dict]:
    with _vectors_lock:
        _load()
        return [v for v in _vectors if v["file_path"] == file_path]


def clear_all_vectors() -> int:
    with _vectors_lock:
        _load()
        count = len(_vectors)
        _vectors.clear()
        _save()
    return count
