"""API endpoints for redocking (pose-accuracy / RMSD) validation runs."""

import csv
import io
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.database import get_db, RedockingRun, RedockingTargetResult, RedockingStatus
from app.services import redocking_service
from app.tasks.redocking_tasks import run_redocking_task

router = APIRouter()


class RedockingRunCreate(BaseModel):
    name: str = Field(..., description="Human-readable label for this run")
    source: str = Field(
        "rcsb", description="'rcsb' fetches pdb_ids fresh from RCSB; 'dataset' reuses the "
        "local DUD-E/LIT-PCBA dataset already on disk (no internet, no PDB-id guessing)"
    )
    pdb_ids: Optional[List[str]] = Field(
        None, description="RCSB source only: PDB ids to re-dock; defaults to a 10-target starter set"
    )
    max_targets: Optional[int] = Field(
        None, description="Dataset source only: cap on how many of the available local targets to use"
    )
    rmsd_threshold: Optional[float] = Field(None, description="Success cutoff in Angstrom (default 2.0)")
    ligand_resnames: Optional[Dict[str, str]] = Field(
        None, description="RCSB source only: override auto-detected ligand residue name per PDB id"
    )
    docking_params: Optional[Dict[str, Any]] = None


@router.get("/defaults")
async def get_defaults():
    """The suggested starter set of PDB ids, the default RMSD success threshold,
    and how many local-dataset targets are available for the 'dataset' source."""
    return {
        "pdb_ids": redocking_service.DEFAULT_PDB_IDS,
        "rmsd_threshold": redocking_service.DEFAULT_RMSD_THRESHOLD,
        "dataset_targets_available": len(redocking_service.list_dataset_redocking_targets()),
    }


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_run(payload: RedockingRunCreate, db: AsyncSession = Depends(get_db)):
    """Create and immediately start a redocking run - the "one-click" endpoint."""
    try:
        config = redocking_service.build_run_config(
            pdb_ids=payload.pdb_ids,
            rmsd_threshold=payload.rmsd_threshold,
            ligand_resnames=payload.ligand_resnames,
            docking_params=payload.docking_params,
            source=payload.source,
            max_targets=payload.max_targets,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    run = RedockingRun(
        name=payload.name,
        status=RedockingStatus.PENDING,
        config=config,
        total_targets=len(config["pdb_ids"]),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    task = run_redocking_task.delay(str(run.id))
    run.celery_task_id = task.id
    await db.commit()

    return {"id": str(run.id), "name": run.name, "status": run.status, "celery_task_id": task.id}


@router.get("/runs")
async def list_runs(skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """History of past redocking runs."""
    result = await db.execute(
        select(RedockingRun).order_by(RedockingRun.created_at.desc()).offset(skip).limit(limit)
    )
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "status": r.status,
            "total_targets": r.total_targets,
            "completed_targets": r.completed_targets,
            "failed_targets": r.failed_targets,
            "created_at": r.created_at,
            "completed_at": r.completed_at,
            "last_heartbeat": r.last_heartbeat,
        }
        for r in runs
    ]


async def _get_run_or_404(run_id: UUID, db: AsyncSession) -> RedockingRun:
    result = await db.execute(select(RedockingRun).where(RedockingRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Redocking run not found")
    return run


async def _build_run_detail(run: RedockingRun, db: AsyncSession) -> Dict[str, Any]:
    result = await db.execute(
        select(RedockingTargetResult)
        .where(RedockingTargetResult.run_id == run.id)
        .order_by(RedockingTargetResult.created_at)
    )
    target_rows = result.scalars().all()

    targets = [
        {
            "id": str(t.id),
            "pdb_id": t.pdb_id,
            "ligand_resname": t.ligand_resname,
            "status": t.status,
            "rmsd": t.rmsd,
            "success": t.success,
            "rmsd_sr5": t.rmsd_sr5,
            "success_sr5": t.success_sr5,
            "best_affinity": t.best_affinity,
            "cnn_affinity": t.cnn_affinity,
            "processing_time_sec": t.processing_time_sec,
            "error_message": t.error_message,
        }
        for t in target_rows
    ]

    completed_targets = [t for t in target_rows if t.status == RedockingStatus.COMPLETED]
    aggregate: Dict[str, Any] = {}
    if completed_targets:
        # SR0/SR5 naming matches SwissDock's own published validation
        # (Grosdidier et al. 2011, NAR) for a directly comparable number:
        # SR0 = top-ranked pose within threshold, SR5 = best of the top-5
        # ranked poses within threshold.
        rmsds_sr0 = [t.rmsd for t in completed_targets if t.rmsd is not None]
        rmsds_sr5 = [t.rmsd_sr5 for t in completed_targets if t.rmsd_sr5 is not None]
        n_success_sr0 = sum(1 for t in completed_targets if t.success)
        n_success_sr5 = sum(1 for t in completed_targets if t.success_sr5)
        aggregate = {
            "n_targets": len(completed_targets),
            "mean_rmsd": sum(rmsds_sr0) / len(rmsds_sr0) if rmsds_sr0 else None,
            "median_rmsd": sorted(rmsds_sr0)[len(rmsds_sr0) // 2] if rmsds_sr0 else None,
            "n_success": n_success_sr0,
            "success_rate": n_success_sr0 / len(completed_targets) if completed_targets else None,
            "mean_rmsd_sr5": sum(rmsds_sr5) / len(rmsds_sr5) if rmsds_sr5 else None,
            "median_rmsd_sr5": sorted(rmsds_sr5)[len(rmsds_sr5) // 2] if rmsds_sr5 else None,
            "n_success_sr5": n_success_sr5,
            "success_rate_sr5": n_success_sr5 / len(completed_targets) if completed_targets else None,
        }

    return {
        "id": str(run.id),
        "name": run.name,
        "status": run.status,
        "config": run.config,
        "total_targets": run.total_targets,
        "completed_targets": run.completed_targets,
        "failed_targets": run.failed_targets,
        "error_message": run.error_message,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "last_heartbeat": run.last_heartbeat,
        "targets": targets,
        "aggregate": aggregate,
    }


@router.get("/runs/{run_id}")
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    """Run status + per-target results + aggregate - used for progress polling."""
    run = await _get_run_or_404(run_id, db)
    return await _build_run_detail(run, db)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(run_id, db)
    if run.status not in (RedockingStatus.PENDING, RedockingStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run cannot be cancelled from status: {run.status}",
        )

    if run.celery_task_id:
        from app.celery_app import celery_app
        celery_app.control.revoke(run.celery_task_id, terminate=True)

    run.status = RedockingStatus.CANCELLED
    run.completed_at = datetime.utcnow()
    await db.commit()
    return {"message": "Redocking run cancelled"}


# How stale a "running" run's heartbeat has to be before /resume will touch it -
# below this, we assume a worker is genuinely still working on it.
STALE_HEARTBEAT_MINUTES = 5


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Re-dispatch a run that didn't finish - a crashed/killed worker, a previous
    cancel, or a prior failure. run_redocking_sync() skips PDB targets that
    already completed in an earlier attempt.
    """
    run = await _get_run_or_404(run_id, db)

    if run.status == RedockingStatus.RUNNING:
        stale = (
            run.last_heartbeat is None
            or (datetime.utcnow() - run.last_heartbeat) > timedelta(minutes=STALE_HEARTBEAT_MINUTES)
        )
        if not stale:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run looks actively in progress (recent heartbeat) - not resuming.",
            )
    elif run.status not in (RedockingStatus.PENDING, RedockingStatus.FAILED, RedockingStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run cannot be resumed from status: {run.status}",
        )

    run.status = RedockingStatus.PENDING
    run.error_message = None
    await db.commit()

    task = run_redocking_task.delay(str(run.id))
    run.celery_task_id = task.id
    await db.commit()

    return {"id": str(run.id), "status": run.status, "celery_task_id": task.id}


@router.get("/runs/{run_id}/export.json")
async def export_run_json(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(run_id, db)
    detail = await _build_run_detail(run, db)
    content = json.dumps(detail, indent=2, default=str)
    filename = f"redocking_{run.name.replace(' ', '_')}_{str(run.id)[:8]}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/runs/{run_id}/export.csv")
async def export_run_csv(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(run_id, db)
    detail = await _build_run_detail(run, db)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "pdb_id", "ligand_resname", "status", "rmsd_angstrom_sr0", "success_sr0",
        "rmsd_angstrom_sr5", "success_sr5",
        "best_affinity", "cnn_affinity", "processing_time_sec",
    ])
    for t in detail["targets"]:
        writer.writerow([
            t["pdb_id"], t["ligand_resname"], t["status"], t["rmsd"], t["success"],
            t["rmsd_sr5"], t["success_sr5"],
            t["best_affinity"], t["cnn_affinity"], t["processing_time_sec"],
        ])

    filename = f"redocking_{run.name.replace(' ', '_')}_{str(run.id)[:8]}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
