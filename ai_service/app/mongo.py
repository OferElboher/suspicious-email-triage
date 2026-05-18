"""Mongo client for Celery tasks (sync pymongo)."""

# os reads MONGO_URI from container or local shell environment.
import os

# MongoClient provides the synchronous MongoDB connection used by Celery tasks.
from pymongo import MongoClient

# _client is reused across task executions inside the worker process.
_client = None


def get_db():
    # global allows lazy initialization once per process.
    global _client
    if _client is None:
        # MONGO_URI defaults to local dev MongoDB when not injected.
        uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/triage")
        # MongoClient defers actual network use until the first operation.
        _client = MongoClient(uri)
    # get_default_database uses the database name embedded in MONGO_URI.
    return _client.get_default_database()
