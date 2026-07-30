import hashlib
import logging
import os
from typing import Optional

try:
    import redis
except ImportError:
    redis = None

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = 604800  # 7 days (604,800 seconds)


class CacheManager:
    """
    Cryptographic SHA-256 diff-hashing cache manager using Redis infrastructure
    to bypass LLM processing for duplicate diff chunks and lower API expenditure.
    """

    def __init__(self, redis_client=None, redis_url: Optional[str] = None):
        if redis_client is not None:
            self._client = redis_client
        else:
            self._client = None
            if redis is not None:
                try:
                    url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
                    self._client = redis.from_url(url, socket_timeout=2.0, socket_connect_timeout=2.0)
                except Exception as exc:
                    logger.warning("CacheManager: Failed to initialize Redis client: %s", exc)

    @staticmethod
    def normalize_and_hash(diff_text: str) -> str:
        """
        Normalize incoming diff string (strip leading/trailing whitespace)
        and compute its SHA-256 hash using Python native hashlib.
        """
        if not diff_text:
            return ""
        normalized = diff_text.strip()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def get_cached_review(self, diff_hash: str) -> Optional[str]:
        """
        Retrieve a cached review by diff hash.
        Returns None if key is missing, empty, or if a Redis error occurs.
        """
        if not diff_hash or self._client is None:
            return None

        try:
            val = self._client.get(f"diff_hash:{diff_hash}")
            if val is None:
                return None
            if isinstance(val, bytes):
                return val.decode("utf-8")
            return str(val)
        except Exception as exc:
            logger.warning("CacheManager.get_cached_review failed gracefully: %s", exc)
            return None

    def set_cached_review(self, diff_hash: str, review: str, ttl: int = DEFAULT_TTL_SECONDS) -> bool:
        """
        Cache a review string for diff hash with a default 7-day TTL (604800s).
        Returns True if set successfully, False on error or bypass.
        """
        if not diff_hash or not review or self._client is None:
            return False

        try:
            self._client.setex(f"diff_hash:{diff_hash}", ttl, review)
            return True
        except Exception as exc:
            logger.warning("CacheManager.set_cached_review failed gracefully: %s", exc)
            return False


# Module singleton instance
default_cache_manager = CacheManager()
