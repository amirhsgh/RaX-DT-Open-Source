"""API endpoints for benchmark suite (DUD-E / LIT-PCBA enrichment validation) runs."""

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

from app.database import get_db, BenchmarkRun, BenchmarkTargetResult, BenchmarkStatus
from app.services import benchmark_service
from app.services.benchmark_metrics import aggregate_metrics
from app.tasks.benchmark_tasks import run_benchmark_task

router = APIRouter()


class BenchmarkRunCreate(BaseModel):
    name: str = Field(..., description="Human-readable label for this run")
    preset: Optional[str] = Field(None, description="Preset name, e.g. 'quick_demo' or 'standard'")
    targets: Optional[List[str]] = Field(None, description="Explicit target ids, overrides/extends the preset")
    max_actives_per_target: Optional[int] = None
    max_decoys_per_target: Optional[int] = None
    rank_by: Optional[str] = Field(None, pattern="^(affinity|cnn_score|both)$")
    docking_params: Optional[Dict[str, Any]] = None


@router.get("/targets")
async def get_targets():
    """List benchmark targets discovered under BENCHMARK_DATA_DIR."""
    return benchmark_service.list_targets()


@router.get("/presets")
async def get_presets():
    """List predefined benchmark presets."""
    return benchmark_service.PRESETS


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_run(payload: BenchmarkRunCreate, db: AsyncSession = Depends(get_db)):
    """Create and immediately start a benchmark run - the "one-click" endpoint."""
    try:
        config = benchmark_service.build_run_config(
            preset=payload.preset,
            targets=payload.targets,
            max_actives_per_target=payload.max_actives_per_target,
            max_decoys_per_target=payload.max_decoys_per_target,
            rank_by=payload.rank_by,
            docking_params=payload.docking_params,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    run = BenchmarkRun(
        name=payload.name,
        status=BenchmarkStatus.PENDING,
        config=config,
        total_targets=len(config["targets"]),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    task = run_benchmark_task.delay(str(run.id))
    run.celery_task_id = task.id
    await db.commit()

    return {"id": str(run.id), "name": run.name, "status": run.status, "celery_task_id": task.id}


@router.get("/runs")
async def list_runs(skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """History of past benchmark runs."""
    result = await db.execute(
        select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc()).offset(skip).limit(limit)
    )
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "status": r.status,
            "preset": (r.config or {}).get("preset"),
            "total_targets": r.total_targets,
            "completed_targets": r.completed_targets,
            "failed_targets": r.failed_targets,
            "created_at": r.created_at,
            "completed_at": r.completed_at,
            "last_heartbeat": r.last_heartbeat,
        }
        for r in runs
    ]


async def _get_run_or_404(run_id: UUID, db: AsyncSession) -> BenchmarkRun:
    result = await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benchmark run not found")
    return run


async def _build_run_detail(run: BenchmarkRun, db: AsyncSession) -> Dict[str, Any]:
    result = await db.execute(
        select(BenchmarkTargetResult)
        .where(BenchmarkTargetResult.run_id == run.id)
        .order_by(BenchmarkTargetResult.created_at)
    )
    target_rows = result.scalars().all()

    targets = [
        {
            "id": str(t.id),
            "target_name": t.target_name,
            "dataset_source": t.dataset_source,
            "status": t.status,
            "n_actives": t.n_actives,
            "n_decoys": t.n_decoys,
            "n_failed": t.n_failed,
            "metrics": t.metrics,
            "avg_processing_time_sec": t.avg_processing_time_sec,
            "total_wallclock_sec": t.total_wallclock_sec,
            "error_message": t.error_message,
        }
        for t in target_rows
    ]

    aggregate: Dict[str, Any] = {}
    for rank_by_key in ("affinity", "cnn_score"):
        per_target = [
            t.metrics[rank_by_key] for t in target_rows if t.metrics and t.metrics.get(rank_by_key)
        ]
        if per_target:
            aggregate[rank_by_key] = aggregate_metrics(per_target)

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
    if run.status not in (BenchmarkStatus.PENDING, BenchmarkStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run cannot be cancelled from status: {run.status}",
        )

    if run.celery_task_id:
        from app.celery_app import celery_app
        celery_app.control.revoke(run.celery_task_id, terminate=True)

    run.status = BenchmarkStatus.CANCELLED
    run.completed_at = datetime.utcnow()
    await db.commit()
    return {"message": "Benchmark run cancelled"}


# How stale a "running" run's heartbeat has to be before /resume will touch it -
# below this, we assume a worker is genuinely still working on it.
STALE_HEARTBEAT_MINUTES = 5


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Re-dispatch a run that didn't finish - a crashed/killed worker, a previous
    cancel, or a prior failure. run_benchmark_sync() skips targets that already
    completed in an earlier attempt, so this picks up where it left off rather
    than starting over.
    """
    run = await _get_run_or_404(run_id, db)

    if run.status == BenchmarkStatus.RUNNING:
        stale = (
            run.last_heartbeat is None
            or (datetime.utcnow() - run.last_heartbeat) > timedelta(minutes=STALE_HEARTBEAT_MINUTES)
        )
        if not stale:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run looks actively in progress (recent heartbeat) - not resuming.",
            )
    elif run.status not in (BenchmarkStatus.PENDING, BenchmarkStatus.FAILED, BenchmarkStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run cannot be resumed from status: {run.status}",
        )

    run.status = BenchmarkStatus.PENDING
    run.error_message = None
    await db.commit()

    task = run_benchmark_task.delay(str(run.id))
    run.celery_task_id = task.id
    await db.commit()

    return {"id": str(run.id), "status": run.status, "celery_task_id": task.id}


@router.get("/runs/{run_id}/export.json")
async def export_run_json(run_id: UUID, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(run_id, db)
    detail = await _build_run_detail(run, db)
    content = json.dumps(detail, indent=2, default=str)
    filename = f"benchmark_{run.name.replace(' ', '_')}_{str(run.id)[:8]}.json"
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
        "target_name", "dataset_source", "status", "n_actives", "n_decoys", "n_failed",
        "auroc_affinity", "ef1_affinity", "ef5_affinity", "ef10_affinity", "bedroc_affinity",
        "auroc_cnn", "ef1_cnn", "ef5_cnn", "ef10_cnn", "bedroc_cnn",
        "avg_processing_time_sec", "total_wallclock_sec",
    ])
    for t in detail["targets"]:
        metrics = t.get("metrics") or {}
        affinity = metrics.get("affinity") or {}
        cnn = metrics.get("cnn_score") or {}
        writer.writerow([
            t["target_name"], t["dataset_source"], t["status"], t["n_actives"], t["n_decoys"], t["n_failed"],
            affinity.get("auroc"), affinity.get("ef1"), affinity.get("ef5"), affinity.get("ef10"), affinity.get("bedroc"),
            cnn.get("auroc"), cnn.get("ef1"), cnn.get("ef5"), cnn.get("ef10"), cnn.get("bedroc"),
            t["avg_processing_time_sec"], t["total_wallclock_sec"],
        ])

    filename = f"benchmark_{run.name.replace(' ', '_')}_{str(run.id)[:8]}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
