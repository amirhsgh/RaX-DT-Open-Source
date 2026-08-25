"""API endpoints for screening job management."""

import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db, ScreeningJob, Project, DockingResult
from app.schemas.job_schemas import (
    ScreeningJobCreate,
    ScreeningJobResponse,
    JobStatusUpdate,
    JobProgressResponse,
    JobSummary,
    BatchJobsResponse
)
from app.tasks.screening_tasks import run_screening_pipeline
from app.services.gnina_local_service import gnina_local_service

router = APIRouter()


@router.post("/", response_model=ScreeningJobResponse, status_code=status.HTTP_201_CREATED)
async def create_screening_job(
    job_data: ScreeningJobCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new screening job."""
    try:
        # Verify project exists
        result = await db.execute(select(Project).where(Project.id == job_data.project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Create job
        job = ScreeningJob(
            project_id=job_data.project_id,
            name=job_data.name,
            config=job_data.config,
            
            # Processing parameters
            pH=job_data.processing_params.pH,
            max_tautomers=job_data.processing_params.max_tautomers,
            max_stereoisomers=job_data.processing_params.max_stereoisomers,
            use_stable_tautomers=job_data.processing_params.use_stable_tautomers,
            
            # Docking parameters
            center_x=job_data.docking_params.center_x,
            center_y=job_data.docking_params.center_y,
            center_z=job_data.docking_params.center_z,
            size_x=job_data.docking_params.size_x,
            size_y=job_data.docking_params.size_y,
            size_z=job_data.docking_params.size_z,
            exhaustiveness=job_data.docking_params.exhaustiveness,
            num_modes=job_data.docking_params.num_modes,
        )
        
        db.add(job)
        await db.commit()
        await db.refresh(job)
        
        return job
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create screening job: {str(e)}"
        )


@router.get("/", response_model=BatchJobsResponse)
async def list_jobs(
    skip: int = 0,
    limit: int = 100,
    project_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List screening jobs with optional filtering."""
    try:
        query = select(ScreeningJob)
        
        if project_id:
            query = query.where(ScreeningJob.project_id == project_id)
        
        if status_filter:
            query = query.where(ScreeningJob.status == status_filter)
        
        # Get total count
        count_query = select(func.count(ScreeningJob.id))
        if project_id:
            count_query = count_query.where(ScreeningJob.project_id == project_id)
        if status_filter:
            count_query = count_query.where(ScreeningJob.status == status_filter)
        
        total_count_result = await db.execute(count_query)
        total_count = total_count_result.scalar()
        
        # Get jobs
        query = query.offset(skip).limit(limit).order_by(ScreeningJob.created_at.desc())
        result = await db.execute(query)
        jobs = result.scalars().all()
        
        # Convert to JobSummary format
        job_summaries = []
        for job in jobs:
            # Get docking statistics
            docking_stats = await db.execute(
                select(
                    func.count(DockingResult.id).label('total'),
                    func.min(DockingResult.binding_affinity).label('best'),
                    func.max(DockingResult.binding_affinity).label('worst'),
                    func.avg(DockingResult.binding_affinity).label('average')
                ).where(DockingResult.job_id == job.id)
            )
            stats = docking_stats.first()
            
            processing_time = None
            if job.completed_at and job.started_at:
                processing_time = (job.completed_at - job.started_at).total_seconds()
            
            job_summaries.append(JobSummary(
                id=job.id,
                name=job.name,
                status=job.status,
                current_stage=job.current_stage,
                progress_percentage=job.progress_percentage or 0.0,
                processed_ligands=job.processed_ligands or 0,
                total_ligands=job.total_ligands,
                successful_dockings=stats.total if stats.total else 0,
                failed_dockings=job.failed_ligands,
                best_affinity=stats.best,
                worst_affinity=stats.worst,
                average_affinity=stats.average,
                processing_time=processing_time,
                created_at=job.created_at,
                completed_at=job.completed_at
            ))
        
        return BatchJobsResponse(
            jobs=job_summaries,
            total_count=total_count,
            page=skip // limit + 1,
            page_size=limit,
            total_pages=(total_count + limit - 1) // limit
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list jobs: {str(e)}"
        )


@router.get("/recent")
async def get_recent_jobs(limit: int = 5, db: AsyncSession = Depends(get_db)):
    """Get recent jobs for dashboard."""
    try:
        result = await db.execute(
            select(ScreeningJob)
            .order_by(ScreeningJob.created_at.desc())
            .limit(limit)
        )
        jobs = result.scalars().all()
        
        # Convert to dashboard format
        recent_jobs = []
        for job in jobs:
            from datetime import datetime
            
            # Calculate progress and estimated time
            progress = job.progress_percentage or 0
            
            if job.status == "running":
                status_text = "running"
                if job.started_at:
                    elapsed = datetime.utcnow() - job.started_at
                    if job.total_ligands and job.processed_ligands:
                        rate = job.processed_ligands / max(elapsed.total_seconds(), 1)
                        remaining = (job.total_ligands - job.processed_ligands) / max(rate, 0.001)
                        hours, remainder = divmod(remaining, 3600)
                        minutes, _ = divmod(remainder, 60)
                        estimated_time = f"{int(hours)}h {int(minutes)}m"
                    else:
                        estimated_time = "Calculating..."
                else:
                    estimated_time = "Starting..."
            elif job.status == "completed":
                status_text = "completed"
                estimated_time = None
            else:
                status_text = job.status
                estimated_time = "Queued"
            
            recent_jobs.append({
                "id": str(job.id),
                "name": job.name,
                "status": status_text,
                "progress": progress,
                "startTime": job.started_at.strftime("%Y-%m-%d %H:%M") if job.started_at else "Queued",
                "estimatedTime": estimated_time,
                "completedTime": job.completed_at.strftime("%Y-%m-%d %H:%M") if job.completed_at else None
            })
        
        return recent_jobs
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recent jobs: {str(e)}"
        )


@router.get("/{job_id}", response_model=ScreeningJobResponse)
async def get_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific screening job by ID."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        return job
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job: {str(e)}"
        )


@router.get("/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed progress information for a job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Calculate estimated time remaining and processing rate
        estimated_time_remaining = None
        processing_rate = None
        
        if job.started_at and job.processed_ligands > 0:
            from datetime import datetime
            elapsed_time = (datetime.utcnow() - job.started_at).total_seconds()
            processing_rate = job.processed_ligands / elapsed_time
            
            if processing_rate > 0 and job.total_ligands > job.processed_ligands:
                remaining_ligands = job.total_ligands - job.processed_ligands
                estimated_time_remaining = remaining_ligands / processing_rate
        
        return JobProgressResponse(
            id=job.id,
            status=job.status,
            current_stage=job.current_stage,
            progress_percentage=job.progress_percentage,
            processed_ligands=job.processed_ligands,
            failed_ligands=job.failed_ligands,
            total_ligands=job.total_ligands,
            estimated_time_remaining=estimated_time_remaining,
            processing_rate=processing_rate
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job progress: {str(e)}"
        )


@router.patch("/{job_id}", response_model=ScreeningJobResponse)
async def update_job_status(
    job_id: UUID,
    status_update: JobStatusUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update job status and progress."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        # Update fields
        if status_update.status is not None:
            job.status = status_update.status
        if status_update.current_stage is not None:
            job.current_stage = status_update.current_stage
        if status_update.progress_percentage is not None:
            job.progress_percentage = status_update.progress_percentage
        if status_update.processed_ligands is not None:
            job.processed_ligands = status_update.processed_ligands
        if status_update.failed_ligands is not None:
            job.failed_ligands = status_update.failed_ligands
        if status_update.error_message is not None:
            job.error_message = status_update.error_message
        
        await db.commit()
        await db.refresh(job)
        
        return job
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update job: {str(e)}"
        )


@router.post("/{job_id}/start")
async def start_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Start processing a screening job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        if job.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be started from status: {job.status}"
            )
        
        # Validate files are uploaded
        if not job.ligand_file_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ligand file not uploaded"
            )
        
        if not job.protein_file_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Protein file not uploaded"
            )
        
        # Update job status
        job.status = "running"
        job.current_stage = "ligand_prep_3d"
        from datetime import datetime
        job.started_at = datetime.utcnow()
        
        await db.commit()
        
        # Start processing using Celery task (truly background)
        task = run_screening_pipeline.delay(str(job_id))
        
        # Store Celery task ID in job for tracking
        job.celery_task_id = task.id
        await db.commit()
        
        return {
            "message": "Job started successfully", 
            "job_id": str(job_id),
            "task_id": task.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start job: {str(e)}"
        )


@router.post("/{job_id}/pause")
async def pause_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Pause a running job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        if job.status != "running":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be paused from status: {job.status}"
            )
        
        job.status = "paused"
        await db.commit()
        
        return {"message": "Job paused successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to pause job: {str(e)}"
        )


@router.post("/{job_id}/resume")
async def resume_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Resume a paused job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        if job.status != "paused":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be resumed from status: {job.status}"
            )
        
        job.status = "running"
        await db.commit()
        
        # Note: In a real implementation, you would need to restart the background task
        # For now, just update the status
        
        return {"message": "Job resumed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume job: {str(e)}"
        )


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Cancel a running job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        if job.status not in ["pending", "running"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be cancelled from status: {job.status}"
            )

        # Try to cancel the running GNINA process
        cancellation_success = False
        if job.status == "running":
            try:
                cancellation_success = gnina_local_service.cancel_job(str(job.id))
            except Exception as e:
                # Log the error but continue with database update
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to cancel GNINA process for job {job.id}: {e}")

        job.status = "cancelled"
        await db.commit()

        message = "Job cancelled successfully"
        if job.status == "running" and not cancellation_success:
            message += " (database updated, but process cancellation may have failed)"

        return {"message": message}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel job: {str(e)}"
        )


@router.delete("/{job_id}")
async def delete_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a screening job and all associated data."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Screening job not found"
            )
        
        if job.status == "running":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete running job. Cancel it first."
            )
        
        await db.delete(job)
        await db.commit()
        
        return {"message": "Job deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete job: {str(e)}"
        )


@router.get("/{job_id}/protein")
async def get_job_protein(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get protein structure for job."""
    try:
        from app.database import Protein
        
        # Get job first
        job_result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = job_result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get protein
        protein_result = await db.execute(select(Protein).where(Protein.job_id == job_id))
        protein = protein_result.scalar_one_or_none()
        
        if not protein:
            raise HTTPException(status_code=404, detail="Protein not found for this job")
        
        # Read protein file
        if protein.prepared_pdbqt_path and os.path.exists(protein.prepared_pdbqt_path):
            with open(protein.prepared_pdbqt_path, 'r') as f:
                pdb_content = f.read()
        elif protein.original_file_path and os.path.exists(protein.original_file_path):
            with open(protein.original_file_path, 'r') as f:
                pdb_content = f.read()
        else:
            raise HTTPException(status_code=404, detail="Protein structure file not found")
        
        return {
            "protein_name": protein.name,
            "pdb_content": pdb_content,
            "pdbqt_content": pdb_content if protein.prepared_pdbqt_path else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get protein: {str(e)}"
        )


@router.get("/{job_id}/logs")
async def get_job_logs(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get job execution logs."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # For now, return mock logs as we don't have a logging system yet
        # In a real implementation, you would read from log files or database
        logs = [
            {"time": "10:00:00", "level": "INFO", "message": "Job started"},
            {"time": "10:00:05", "level": "INFO", "message": "Processing ligands..."},
            {"time": "10:05:30", "level": "INFO", "message": "Protein prepared successfully"},
            {"time": "10:10:15", "level": "INFO", "message": "Starting docking calculations"},
        ]
        
        if job.status == "failed":
            logs.append({"time": "10:15:00", "level": "ERROR", "message": job.error_message or "Job failed"})
        
        return {"logs": logs}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job logs: {str(e)}"
        )


@router.get("/{job_id}/task-status")
async def get_job_task_status(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get Celery task status for a job."""
    try:
        result = await db.execute(select(ScreeningJob).where(ScreeningJob.id == job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if not job.celery_task_id:
            return {"status": "no_task", "message": "No background task associated with this job"}
        
        # Get task status from Celery directly
        from app.celery_app import celery_app
        task_result = celery_app.AsyncResult(job.celery_task_id)
        
        task_info = {
            "task_id": job.celery_task_id,
            "status": task_result.status,
            "result": task_result.result,
            "info": task_result.info
        }
        
        return {
            "job_id": str(job_id),
            "celery_task_id": job.celery_task_id,
            "task_status": task_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(e)}"
        )