"""
OCEAN-X Multi-Tier Caching Service.
Provides high-performance in-memory caching with 15-minute TTL,
with transparent Redis backing when REDIS_URL is configured.
"""
import time
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self, redis_url: Optional[str] = None, default_ttl_seconds: int = 900):
        self.default_ttl = default_ttl_seconds
        self._memory_cache: dict[str, tuple[float, Any]] = {}
        self._redis_client = None

        if redis_url:
            try:
                import redis
                self._redis_client = redis.from_url(redis_url, decode_responses=True)
                self._redis_client.ping()
                logger.info("Connected to Redis cache at %s", redis_url)
            except Exception as e:
                logger.warning("Redis cache unavailable (%s). Using in-memory TTL cache.", e)
                self._redis_client = None

    def get(self, key: str) -> Optional[Any]:
        # 1. Check Redis if available
        if self._redis_client:
            try:
                val = self._redis_client.get(key)
                if val is not None:
                    return json.loads(val)
            except Exception:
                pass

        # 2. Check in-memory cache
        item = self._memory_cache.get(key)
        if item:
            expires_at, data = item
            if time.time() < expires_at:
                return data
            else:
                del self._memory_cache[key]
        return None

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl

        # 1. Set in Redis if available
        if self._redis_client:
            try:
                self._redis_client.setex(key, ttl, json.dumps(value))
            except Exception:
                pass

        # 2. Set in-memory
        expires_at = time.time() + ttl
        self._memory_cache[key] = (expires_at, value)

    def clear(self) -> None:
        self._memory_cache.clear()
        if self._redis_client:
            try:
                self._redis_client.flushdb()
            except Exception:
                pass
