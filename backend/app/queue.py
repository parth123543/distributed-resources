"""
Redis-backed job queue.

Design: a single Redis list ("jobs:queue") acts as a FIFO queue.
- Producer (API): LPUSH job_ids onto the left side of the list.
- Consumer (worker): BRPOP pulls from the right side — blocking until
  an item is available, which means workers sleep at zero CPU cost
  while idle rather than polling.

Why a list and not Redis Streams or Pub/Sub?
- Pub/Sub: fire-and-forget, no persistence — if a worker is offline
  when a job is published, it misses it entirely. Not acceptable.
- Redis Streams: more powerful (consumer groups, acknowledgements,
  replay), but significantly more complex to implement correctly.
  That's a production upgrade path, not Day 8 scope.
- List + BRPOP: simple, durable (items persist until popped), atomic
  (Redis guarantees one consumer per pop), and battle-tested. Celery
  uses this same primitive as its default broker backend.
"""
import redis

from app.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

JOBS_QUEUE_KEY = "jobs:queue"


def push_job(job_id: str) -> None:
    """Push a job ID onto the queue. Called by the API after job creation."""
    redis_client.lpush(JOBS_QUEUE_KEY, job_id)


def pop_job_blocking(timeout: int = 30) -> str | None:
    """
    Block until a job is available, then return its ID.
    timeout=30 means: wait up to 30s, then return None if nothing arrived.
    Workers call this in a loop so they cycle back and block again on None.
    """
    result = redis_client.brpop(JOBS_QUEUE_KEY, timeout=timeout)
    if result:
        _, job_id = result  # brpop returns (key_name, value) tuple
        return job_id
    return None


def queue_depth() -> int:
    """How many jobs are currently waiting. Useful for monitoring."""
    return redis_client.llen(JOBS_QUEUE_KEY)