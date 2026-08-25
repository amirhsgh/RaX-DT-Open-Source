"""
Celery task for running redocking (pose-accuracy) validation suites.

Mirrors app/tasks/benchmark_tasks.py exactly - same sync-DB-access-via-
get_sync_database() and self.update_state() progress-reporting pattern.
"""

import logging
from datetime import datetime

from sqlalchemy import select

from app.celery_app import celery_app
from app.database.connection import get_sync_database
from app.database.models import RedockingRun, RedockingStatus
from app.services.redocking_service import run_redocking_sync

logger = logging.getLogger(__name__)


@celery_app.task(bind=True)
def run_redocking_task(self, run_id: str):
    """Run every PDB target in a RedockingRun. Runs in a separate Celery worker process."""
    logger.info(f"🎯 Starting Celery task for redocking run {run_id}")

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
            logger.warning(f"Failed to update redocking progress: {e}")

    try:
        result = run_redocking_sync(run_id, progress_callback)
        logger.info(f"✅ Redocking run {run_id} finished: {result}")
        return result

    except Exception as e:
        logger.error(f"❌ Redocking run {run_id} failed: {e}", exc_info=True)
        try:
            with get_sync_database() as db:
                run = db.execute(
                    select(RedockingRun).where(RedockingRun.id == run_id)
                ).scalar_one_or_none()
                if run:
                    run.status = RedockingStatus.FAILED
                    run.error_message = str(e)
                    run.completed_at = datetime.utcnow()
                    db.commit()
        except Exception as db_error:
            logger.error(f"Failed to update redocking run status in database: {db_error}")
        raise
