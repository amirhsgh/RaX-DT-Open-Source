"""
Redis client for caching and rate limiting.
"""

import redis.asyncio as redis
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> redis.Redis:
    """Get Redis client instance."""
    global _redis_client

    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_keepalive=True,
                socket_keepalive_options={}
            )
            # Test connection
            await _redis_client.ping()
            logger.info("✅ Redis connection established")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            # Fallback to mock client for development
            _redis_client = MockRedisClient()

    return _redis_client


class MockRedisClient:
    """Mock Redis client for development when Redis is not available."""

    def __init__(self):
        self._data = {}
        logger.warning("Using mock Redis client - rate limiting may not work properly")

    async def ping(self):
        return "PONG"

    async def set(self, key: str, value: str, ex: int = None):
        self._data[key] = {"value": value, "ex": ex}
        return True

    async def get(self, key: str):
        item = self._data.get(key)
        return item["value"] if item else None

    async def delete(self, *keys):
        for key in keys:
            self._data.pop(key, None)
        return len(keys)

    async def exists(self, key: str):
        return key in self._data

    async def zremrangebyscore(self, key: str, min_score: float, max_score: float):
        # Mock implementation
        return 0

    async def zcard(self, key: str):
        # Mock implementation
        return 0

    async def zadd(self, key: str, mapping: dict):
        # Mock implementation
        return 1

    async def expire(self, key: str, time: int):
        # Mock implementation
        return True

    def pipeline(self):
        return MockPipeline(self)


class MockPipeline:
    """Mock Redis pipeline for development."""

    def __init__(self, client: MockRedisClient):
        self.client = client
        self.commands = []

    def zremrangebyscore(self, key: str, min_score: float, max_score: float):
        self.commands.append(("zremrangebyscore", key, min_score, max_score))
        return self

    def zcard(self, key: str):
        self.commands.append(("zcard", key))
        return self

    def zadd(self, key: str, mapping: dict):
        self.commands.append(("zadd", key, mapping))
        return self

    def expire(self, key: str, time: int):
        self.commands.append(("expire", key, time))
        return self

    async def execute(self):
        # Mock execution - return dummy results
        return [0, 0, 1, True]