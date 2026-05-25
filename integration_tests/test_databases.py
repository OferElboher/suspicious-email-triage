"""Optional MongoDB and Redis connectivity (skipped when ports are closed)."""

from integration_tests.conftest import requires_mongo, requires_redis


@requires_mongo
def test_mongo_ping():
    """MongoDB container must accept a ping on the dev-mapped port."""
    from pymongo import MongoClient

    client = MongoClient("mongodb://127.0.0.1:27018", serverSelectionTimeoutMS=3000)
    client.admin.command("ping")


@requires_redis
def test_redis_ping():
    """Redis container must accept PING on port 6379."""
    import redis

    client = redis.Redis(host="127.0.0.1", port=6379, socket_connect_timeout=3)
    assert client.ping() is True
