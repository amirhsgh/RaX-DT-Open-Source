"""
Celery application configuration for background task processing.
"""

from celery import Celery
from app.core.config import settings

# Create Celery app
celery_app = Celery(
    "virtual_screening",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.screening_tasks",
        "app.tasks.benchmark_tasks",
        "app.tasks.redocking_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # task_acks_late means a task is only removed from the Redis queue once
    # it finishes - but Redis's broker transport treats "not yet acked" as
    # "might be lost" after its own visibility_timeout (default 3600s / 1
    # hour), and silently REDELIVERS the same task to another worker, which
    # then runs concurrently with the original. Benchmark/redocking runs
    # routinely take well over an hour (seen live: a 231-target redocking
    # run got partially re-executed by a second worker after ~60 minutes,
    # producing duplicate result rows - almost certainly also what corrupted
    # an earlier multi-day enrichment benchmark run that mysteriously froze
    # mid-run). Set this far past the longest realistic task (a multi-day
    # full_suite enrichment run) so a task is never redelivered while its
    # original worker is still legitimately working on it.
    broker_transport_options={"visibility_timeout": 604800},  # 7 days
)

# Task routing - use default queue for simplicity
# celery_app.conf.task_routes = {
#     "app.tasks.screening_tasks.*": {"queue": "screening"},
#     "app.tasks.benchmark_tasks.*": {"queue": "screening"},
#     "app.tasks.redocking_tasks.*": {"queue": "screening"},
# }

if __name__ == "__main__":
    celery_app.start()