from __future__ import annotations
import hashlib
import os
from typing import Optional, Any

try:
    import redis
except ImportError:
    redis = None

DEFAULT_TTL = 604800  # 7 days TTL in seconds


def get_redis_client() -> Optional[Any]:
    """
    Safely initializes a Redis client from the REDIS_URL environment variable.
    Returns None if redis module is not installed, REDIS_URL is not set, or connection fails.
    """
    if redis is None:
        return None
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    try:
        return redis.Redis.from_url(redis_url, decode_responses=True)
    except Exception:
        return None


def compute_hash(diff_string: str) -> str:
    """
    Computes a cryptographic SHA-256 hash of the normalized diff string.
    """
    if diff_string is None:
        diff_string = ""
    if not isinstance(diff_string, str):
        diff_string = str(diff_string)
    normalized = diff_string.strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def get_cached_review(hash_key: str) -> Optional[str]:
    """
    Queries Redis for a cached review by hash key.
    Returns the cached review string on a Cache Hit, or None on a Cache Miss / Redis error / missing dependency.
    Fails open gracefully without raising exceptions.
    """
    try:
        client = get_redis_client()
        if client is None:
            return None
        cached_val = client.get(hash_key)
        if cached_val is None:
            return None
        return str(cached_val)
    except Exception:
        return None


def set_cached_review(hash_key: str, review: str, ttl: int = DEFAULT_TTL) -> None:
    """
    Asynchronously/synchronously writes a micro-review back to Redis with a 7-day TTL (604800s).
    Fails open gracefully on Redis connection errors or missing dependency without crashing.
    """
    try:
        client = get_redis_client()
        if client is None:
            return
        client.set(hash_key, review, ex=ttl)
    except Exception:
        pass
