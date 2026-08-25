"""
Celery tasks for screening job processing.
"""

import os
import logging
import asyncio
from datetime import datetime
from celery import current_task
from sqlalchemy import select

from app.celery_app import celery_app
from asgiref.sync import async_to_sync
from app.database.connection import async_session_factory, get_sync_database
from app.database.models import ScreeningJob, JobStatus
from app.services.screening_pipeline import ScreeningPipeline

logger = logging.getLogger(__name__)


@celery_app.task(bind=True)
def run_screening_pipeline(self, job_id: str):
    """
    Run the complete screening pipeline for a job.
    This is a Celery task that runs in a separate worker process.
    """
    import sys
    import os

    logger.info(f"🚀 Starting Celery task for job {job_id}")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Worker process PID: {os.getpid()}")

    # Update task state to PROGRESS immediately
    self.update_state(
        state='PROGRESS',
        meta={'current': 0, 'total': 100, 'percentage': 0, 'status': 'Starting...'}
    )

    try:
        # Run the pipeline using sync database operations
        result = _run_pipeline_sync(job_id, self)
        logger.info(f"✅ Pipeline completed successfully for job {job_id}")
        return result

    except Exception as e:
        logger.error(f"❌ Celery task failed for job {job_id}: {str(e)}", exc_info=True)

        # Update job status to failed in database
        try:
            _update_job_status_to_failed_sync(job_id, str(e))
        except Exception as db_error:
            logger.error(f"Failed to update job status in database: {db_error}")

        # Re-raise the exception so Celery marks task as FAILURE
        raise


def _run_pipeline_sync(job_id: str, celery_task):
    """Run the pipeline with mixed sync/async handling."""
    
    # Initial sync setup
    with get_sync_database() as db:
        # Update task status
        logger.info(f"📋 Pipeline starting for job {job_id}")
        
        # Get job to verify it exists
        result = db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise ValueError(f"Job {job_id} not found in database")
        
        # Update job status to running if it's not already
        if job.status != JobStatus.RUNNING:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.utcnow()
            db.commit()
            logger.info(f"✅ Job {job_id} status updated to RUNNING")
    
    # Create progress callback that updates Celery task
    def progress_callback(progress_info):
        try:
            percentage = progress_info.get('percentage', 0)
            completed = progress_info.get('completed', 0)
            total = progress_info.get('total', 0)
            status_msg = progress_info.get('status', f'Processing {completed}/{total}')
            
            # Update Celery task progress
            celery_task.update_state(
                state='PROGRESS',
                meta={
                    'current': completed,
                    'total': total,
                    'percentage': percentage,
                    'status': status_msg,
                    'job_id': job_id
                }
            )
            logger.info(f"📊 Progress Update: {percentage:.1f}% - {status_msg}")
            
        except Exception as e:
            logger.warning(f"Failed to update progress: {e}")
    
    try:
        # Run the screening pipeline using sync version for Celery workers
        pipeline = ScreeningPipeline()
        
        # Use the synchronous version that doesn't need event loops
        result = pipeline.run_complete_pipeline_sync(job_id, progress_callback)
        
        # Check if pipeline actually succeeded
        if not result or not result.get("success", False):
            error_msg = result.get("error", "Unknown pipeline error") if result else "Pipeline returned None"
            logger.error(f"❌ Pipeline failed for job {job_id}: {error_msg}")
            raise Exception(f"Pipeline execution failed: {error_msg}")
        
        # Final sync database update
        with get_sync_database() as db:
            _update_job_completion_sync(db, job_id)
            
    except Exception as e:
        # Log the full error traceback
        logger.error(f"❌ Pipeline execution error for job {job_id}: {str(e)}", exc_info=True)
        
        # Update job status to failed
        with get_sync_database() as db:
            _update_job_status_to_failed_sync_db(db, job_id, str(e))
        
        raise
    
    logger.info(f"✅ Pipeline completed successfully for job {job_id}")
    return {
        "status": "completed",
        "job_id": job_id,
        "result": result
    }


def _test_database_connection_sync(job_id: str) -> bool:
    """Test database connection and job existence."""
    try:
        with get_sync_database() as db:
            result = db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
            job = result.scalar_one_or_none()
            return job is not None
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        return False


def _update_job_status_to_failed_sync(job_id: str, error_message: str):
    """Update job status to failed with error message."""
    with get_sync_database() as db:
        _update_job_status_to_failed_sync_db(db, job_id, error_message)


def _update_job_progress_sync(job_id: str, percentage: float, completed: int, total: int):
    """Update job progress in the database."""
    try:
        with get_sync_database() as db:
            result = db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
            job = result.scalar_one_or_none()
            
            if job:
                job.progress = percentage
                db.commit()
                logger.debug(f"📊 Updated job {job_id} progress to {percentage}% ({completed}/{total})")
            else:
                logger.warning(f"Job {job_id} not found when updating progress")
                
    except Exception as e:
        logger.warning(f"Failed to update job {job_id} progress in database: {e}")


def _update_job_completion_sync(db, job_id: str):
    """Update job status to completed in the database."""
    try:
        result = db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if job:
            job.status = JobStatus.COMPLETED
            job.progress = 100.0
            job.completed_at = datetime.utcnow()
            db.commit()
            logger.info(f"✅ Job {job_id} marked as COMPLETED")
        else:
            logger.warning(f"Job {job_id} not found when trying to mark as completed")
            
    except Exception as e:
        logger.error(f"Failed to update job {job_id} status to completed: {e}")


def _update_job_status_to_failed_sync_db(db, job_id: str, error_message: str):
    """Update job status to failed in the database."""
    try:
        result = db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if job:
            job.status = JobStatus.FAILED
            job.error_message = error_message
            job.completed_at = datetime.utcnow()
            db.commit()
            logger.info(f"🔴 Job {job_id} marked as FAILED: {error_message}")
        else:
            logger.warning(f"Job {job_id} not found when trying to mark as failed")
            
    except Exception as e:
        logger.error(f"Failed to update job {job_id} status to failed: {e}")


@celery_app.task
def get_task_status(task_id: str):
    """Get the status of a Celery task. (Temporary for backward compatibility)"""
    from app.celery_app import celery_app as app
    result = app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result,
        "info": result.info
    }


@celery_app.task
def add(x, y):
    return x + y
