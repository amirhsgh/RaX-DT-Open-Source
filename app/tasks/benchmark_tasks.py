"""
Celery task for running benchmark suites (DUD-E / LIT-PCBA enrichment validation).

Mirrors app/tasks/screening_tasks.py's run_screening_pipeline task: sync DB access
via get_sync_database() (Celery workers don't use the async session factory), and
Celery task progress updates via self.update_state(state='PROGRESS', ...).
"""

import logging
from datetime import datetime

from sqlalchemy import select

from app.celery_app import celery_app
from app.database.connection import get_sync_database
from app.database.models import BenchmarkRun, BenchmarkStatus
from app.services.benchmark_service import run_benchmark_sync

logger = logging.getLogger(__name__)


@celery_app.task(bind=True)
def run_benchmark_task(self, run_id: str):
    """Run every target in a BenchmarkRun. Runs in a separate Celery worker process."""
    logger.info(f"🎯 Starting Celery task for benchmark run {run_id}")

    self.update_state(
        state="PROGRESS",
        meta={"current": 0, "total": 1, "percentage": 0, "status": "Starting..."},
    )

    def progress_callback(progress_info):
        try:
            self.update_state(
                state="PROGRESS",
                meta={
                    "current": progress_info.get("completed", 0),
                    "total": progress_info.get("total", 0),
                    "percentage": progress_info.get("percentage", 0),
                    "status": progress_info.get("status", ""),
                    "run_id": run_id,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to update benchmark progress: {e}")

    try:
        result = run_benchmark_sync(run_id, progress_callback)
        logger.info(f"✅ Benchmark run {run_id} finished: {result}")
        return result

    except Exception as e:
        logger.error(f"❌ Benchmark run {run_id} failed: {e}", exc_info=True)
        try:
            with get_sync_database() as db:
                run = db.execute(
                    select(BenchmarkRun).where(BenchmarkRun.id == run_id)
                ).scalar_one_or_none()
                if run:
                    run.status = BenchmarkStatus.FAILED
                    run.error_message = str(e)
                    run.completed_at = datetime.utcnow()
                    db.commit()
        except Exception as db_error:
            logger.error(f"Failed to update benchmark run status in database: {db_error}")
        raise
