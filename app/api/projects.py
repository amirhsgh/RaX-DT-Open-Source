"""API endpoints for project management."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, Project
from app.schemas.job_schemas import ProjectCreate, ProjectResponse
from app.core.config import DEFAULT_USER_ID

router = APIRouter()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    try:
        project = Project(
            name=project_data.name,
            description=project_data.description,
            user_id=project_data.user_id or DEFAULT_USER_ID
        )
        
        db.add(project)
        await db.commit()
        await db.refresh(project)
        
        return project
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}"
        )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all projects."""
    try:
        result = await db.execute(
            select(Project)
            .offset(skip)
            .limit(limit)
            .order_by(Project.created_at.desc())
        )
        projects = result.scalars().all()
        return projects
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )


@router.get("/stats")
async def get_projects_stats(db: AsyncSession = Depends(get_db)):
    """Get project statistics for dashboard."""
    try:
        from sqlalchemy import func
        from app.database import ScreeningJob
        
        # Get project stats
        project_stats = await db.execute(select(func.count(Project.id)).select_from(Project))
        total_projects = project_stats.scalar()
        
        # Get job stats
        active_jobs = await db.execute(
            select(func.count(ScreeningJob.id))
            .where(ScreeningJob.status.in_(["pending", "running"]))
        )
        active_jobs_count = active_jobs.scalar()
        
        completed_jobs = await db.execute(
            select(func.count(ScreeningJob.id))
            .where(ScreeningJob.status == "completed")
        )
        completed_jobs_count = completed_jobs.scalar()
        
        total_jobs = await db.execute(select(func.count(ScreeningJob.id)))
        total_jobs_count = total_jobs.scalar()
        
        success_rate = 0.0
        if total_jobs_count > 0:
            success_rate = (completed_jobs_count / total_jobs_count) * 100
        
        return {
            "totalProjects": total_projects,
            "activeJobs": active_jobs_count, 
            "completedJobs": completed_jobs_count,
            "successRate": round(success_rate, 1)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project stats: {str(e)}"
        )


@router.get("/recent")
async def get_recent_projects(limit: int = 5, db: AsyncSession = Depends(get_db)):
    """Get recent projects for dashboard."""
    try:
        from sqlalchemy import func
        from app.database import ScreeningJob
        
        result = await db.execute(
            select(Project)
            .order_by(Project.updated_at.desc())
            .limit(limit)
        )
        projects = result.scalars().all()
        
        # Convert to dashboard format
        recent_projects = []
        for project in projects:
            from datetime import datetime
            
            # Calculate time difference
            time_diff = datetime.utcnow() - project.updated_at
            if time_diff.days > 0:
                last_activity = f"{time_diff.days} days ago"
            elif time_diff.seconds > 3600:
                hours = time_diff.seconds // 3600
                last_activity = f"{hours} hours ago"
            else:
                minutes = time_diff.seconds // 60
                last_activity = f"{minutes} minutes ago"
            
            # Get project job count
            job_count = await db.execute(
                select(func.count())
                .select_from(select(ScreeningJob).where(ScreeningJob.project_id == project.id).subquery())
            )
            total_jobs = job_count.scalar()
            
            # Determine status based on recent activity and job status
            status = "active" if time_diff.days < 7 else "inactive"
            
            recent_projects.append({
                "id": str(project.id),
                "name": project.name,
                "description": project.description or "No description",
                "lastActivity": last_activity,
                "status": status,
                "jobsCount": total_jobs
            })
        
        return recent_projects
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recent projects: {str(e)}"
        )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project by ID."""
    try:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project: {str(e)}"
        )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Update a project."""
    try:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        project.name = project_data.name
        if project_data.description is not None:
            project.description = project_data.description
        if project_data.user_id is not None:
            project.user_id = project_data.user_id
        
        await db.commit()
        await db.refresh(project)
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update project: {str(e)}"
        )


@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a project and all associated jobs."""
    try:
        # Import the models we need for cleanup
        from sqlalchemy import delete
        from app.database import ScreeningJob, FileMetadata, ProcessingLog, Ligand, Protein, DockingResult

        # First check if project exists
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )

        # Get all job IDs for this project
        job_ids_result = await db.execute(
            select(ScreeningJob.id).where(ScreeningJob.project_id == project_id)
        )
        job_ids = [row[0] for row in job_ids_result.fetchall()]

        if job_ids:
            # Delete in correct order to avoid foreign key violations
            # Delete file metadata first
            await db.execute(delete(FileMetadata).where(FileMetadata.job_id.in_(job_ids)))

            # Delete processing logs
            await db.execute(delete(ProcessingLog).where(ProcessingLog.job_id.in_(job_ids)))

            # Delete docking results
            await db.execute(delete(DockingResult).where(DockingResult.job_id.in_(job_ids)))

            # Delete ligands
            await db.execute(delete(Ligand).where(Ligand.job_id.in_(job_ids)))

            # Delete proteins
            await db.execute(delete(Protein).where(Protein.job_id.in_(job_ids)))

            # Delete jobs
            await db.execute(delete(ScreeningJob).where(ScreeningJob.id.in_(job_ids)))

        # Finally delete the project
        await db.delete(project)
        await db.commit()

        return {"message": "Project deleted successfully", "success": True}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}"
        )