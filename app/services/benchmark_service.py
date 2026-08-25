"""
Benchmark service: run enrichment benchmarks (DUD-E / LIT-PCBA style) through the
platform's own docking pipeline and score results with AUROC / EF / BEDROC.

Deliberately self-contained - it reuses DockingService (the same GNINA wrapper the
main screening pipeline uses) but does NOT touch ScreeningJob/Ligand/DockingResult,
so a benchmark run never shows up mixed in with a user's regular screening jobs.
"""

import asyncio
import json
import logging
import random
import statistics
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from rdkit import Chem
from rdkit.Chem import AllChem
from sqlalchemy import select

from app.core.config import settings
from app.database.connection import get_sync_database
from app.database.models import BenchmarkRun, BenchmarkStatus, BenchmarkTargetResult
from app.services.benchmark_metrics import compute_metrics
from app.services.docking_service import DockingService

logger = logging.getLogger(__name__)

RECEPTOR_FILE = "receptor.pdb"
DUDE_ACTIVES_FILE = "actives_final.ism"
DUDE_DECOYS_FILE = "decoys_final.ism"
LITPCBA_ACTIVES_FILE = "actives.smi"
LITPCBA_INACTIVES_FILE = "inactives.smi"

ACTIVE_PREFIX = "ACTIVE__"
DECOY_PREFIX = "DECOY__"

# "full_suite" preset sizing: actives are effectively uncapped (no real target has
# anywhere near this many), decoys are capped at a ratio of actives count (mirrors
# DUD-E's own ~50:1 convention) with a hard per-target ceiling so a handful of huge
# LIT-PCBA targets (hundreds of thousands of inactives) can't dominate the runtime.
FULL_SUITE_MAX_ACTIVES = 100_000
FULL_SUITE_DECOY_RATIO = 50
FULL_SUITE_DECOY_RATIO_CAP = 5_000

# Small, hand-picked presets so a fresh clone has something to click without
# needing to first read the full 117-target list. "targets" use "<folder>:<variant>"
# ids as returned by list_targets().
PRESETS: Dict[str, Dict[str, Any]] = {
    "quick_demo": {
        "label": "Quick demo (3 targets)",
        "description": "Small sanity-check run (~minutes) to confirm the dataset and pipeline are wired correctly.",
        "targets": ["ADRB2:litpcba", "TP53:litpcba", "ampc:dude"],
        "max_actives_per_target": 15,
        "max_decoys_per_target": 150,
        "rank_by": "both",
    },
    "standard": {
        "label": "Standard suite (10 targets)",
        "description": "A representative mix of DUD-E and LIT-PCBA targets, capped for a bounded runtime.",
        "targets": [
            "ADRB2:litpcba", "ALDH1:litpcba", "TP53:litpcba", "VDR:litpcba", "MAPK1:litpcba",
            "ampc:dude", "abl1:dude", "aces:dude", "akt1:dude", "aldr:dude",
        ],
        "max_actives_per_target": 100,
        "max_decoys_per_target": 2000,
        "rank_by": "both",
    },
    "full_suite": {
        "label": "Full suite (all targets)",
        "description": (
            "Every DUD-E + LIT-PCBA target found under BENCHMARK_DATA_DIR. Actives are "
            "kept in full; decoys are capped at 50 per active (the same ratio DUD-E "
            "itself uses), with a hard ceiling per target so a handful of huge LIT-PCBA "
            "targets can't blow out the total runtime. Even so, this dock hundreds of "
            "thousands of compounds - expect it to run for a long time (hours to days, "
            "depending on the server); it is designed to be safely resumable if "
            "interrupted."
        ),
        # Resolved dynamically from list_targets() in build_run_config() rather than
        # hardcoded, so it always matches whatever is actually under BENCHMARK_DATA_DIR.
        "targets": "ALL",
        "max_actives_per_target": FULL_SUITE_MAX_ACTIVES,
        "decoy_ratio": FULL_SUITE_DECOY_RATIO,
        "decoy_ratio_cap": FULL_SUITE_DECOY_RATIO_CAP,
        "rank_by": "both",
    },
}


# ---------------------------------------------------------------------------
# Dataset discovery
# ---------------------------------------------------------------------------

def _target_variants(target_dir: Path) -> Dict[str, Dict[str, str]]:
    """Which dataset conventions this target folder actually has files for."""
    variants: Dict[str, Dict[str, str]] = {}
    if (target_dir / DUDE_ACTIVES_FILE).exists() and (target_dir / DUDE_DECOYS_FILE).exists():
        variants["dude"] = {"actives_file": DUDE_ACTIVES_FILE, "decoys_file": DUDE_DECOYS_FILE}
    if (target_dir / LITPCBA_ACTIVES_FILE).exists() and (target_dir / LITPCBA_INACTIVES_FILE).exists():
        variants["litpcba"] = {"actives_file": LITPCBA_ACTIVES_FILE, "decoys_file": LITPCBA_INACTIVES_FILE}
    return variants


def _find_receptor_and_ref_ligand(target_dir: Path) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Resolve (receptor, reference ligand for --autobox_ligand) for a target folder.

    DUD-E-style folders ship a single canonical `receptor.pdb` (+ usually a
    `crystal_ligand.mol2`). LIT-PCBA-style folders instead ship several
    `<pdbid>_protein.mol2` / `<pdbid>_ligand.mol2` pairs and no `receptor.pdb` -
    in that case we deterministically pick the first PDB entry (alphabetically)
    and use its matched ligand for autobox.
    """
    receptor = target_dir / RECEPTOR_FILE
    if receptor.exists():
        crystal_ligand = target_dir / "crystal_ligand.mol2"
        if crystal_ligand.exists():
            return receptor, crystal_ligand
        any_ligand = next(iter(sorted(target_dir.glob("*_ligand.mol2"))), None)
        return receptor, any_ligand

    protein_files = sorted(target_dir.glob("*_protein.mol2"))
    if protein_files:
        chosen_protein = protein_files[0]
        pdb_id = chosen_protein.name[: -len("_protein.mol2")]
        matched_ligand = target_dir / f"{pdb_id}_ligand.mol2"
        return chosen_protein, matched_ligand if matched_ligand.exists() else None

    return None, None


def _count_lines(path: Path) -> int:
    try:
        with open(path, "r", errors="ignore") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def list_targets(use_cache: bool = True) -> List[Dict[str, Any]]:
    """
    Scan BENCHMARK_DATA_DIR for usable targets. Each target folder can offer up to
    two variants (DUD-E-style curated decoys, LIT-PCBA-style real HTS inactives) -
    each is listed separately as "<folder>:<variant>".
    """
    data_dir = Path(settings.BENCHMARK_DATA_DIR)
    manifest_path = data_dir / "dataset_manifest.json"

    if use_cache and manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except (OSError, json.JSONDecodeError):
            logger.warning("Could not read benchmark dataset manifest, rebuilding it")

    targets: List[Dict[str, Any]] = []
    if not data_dir.exists():
        logger.warning("BENCHMARK_DATA_DIR does not exist: %s", data_dir)
        return targets

    for entry in sorted(data_dir.iterdir()):
        if not entry.is_dir():
            continue
        variants = _target_variants(entry)
        if not variants:
            continue
        receptor, ref_ligand = _find_receptor_and_ref_ligand(entry)
        if receptor is None:
            continue
        for variant, files in variants.items():
            targets.append({
                "id": f"{entry.name}:{variant}",
                "target_name": entry.name,
                "source": variant,
                "n_actives": _count_lines(entry / files["actives_file"]),
                "n_decoys": _count_lines(entry / files["decoys_file"]),
                "has_ref_ligand": ref_ligand is not None,
            })

    try:
        manifest_path.write_text(json.dumps(targets, indent=2))
    except OSError:
        logger.info("Benchmark dataset directory is not writable; skipping manifest cache")

    return targets


def get_preset(name: str) -> Dict[str, Any]:
    if name not in PRESETS:
        raise ValueError(f"Unknown benchmark preset: {name}")
    return PRESETS[name]


def build_run_config(
    preset: Optional[str],
    targets: Optional[List[str]],
    max_actives_per_target: Optional[int],
    max_decoys_per_target: Optional[int],
    rank_by: Optional[str],
    docking_params: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Merge a preset (if any) with explicit overrides into a run config dict."""
    base = get_preset(preset) if preset else {}

    base_targets = base.get("targets")
    if base_targets == "ALL":
        base_targets = [t["id"] for t in list_targets()]

    resolved_targets = targets or base_targets
    if not resolved_targets:
        raise ValueError("Either a preset or an explicit target list is required")

    config = {
        "preset": preset,
        "targets": resolved_targets,
        "max_actives_per_target": max_actives_per_target or base.get("max_actives_per_target", 100),
        "rank_by": rank_by or base.get("rank_by", "both"),
        "docking_params": docking_params or {},
    }

    # decoy_ratio (used by "full_suite") scales the decoy cap with each target's
    # actual actives count instead of a single flat number - see _run_single_target.
    if max_decoys_per_target is not None:
        config["max_decoys_per_target"] = max_decoys_per_target
    elif "decoy_ratio" in base:
        config["decoy_ratio"] = base["decoy_ratio"]
        config["decoy_ratio_cap"] = base.get("decoy_ratio_cap")
    else:
        config["max_decoys_per_target"] = base.get("max_decoys_per_target", 1000)

    return config


# ---------------------------------------------------------------------------
# Ligand preparation (SMILES -> single 3D conformer SDF, ground truth in the name)
# ---------------------------------------------------------------------------

def _load_compounds(
    path: Path, label: int, max_count: Optional[int], seed: int
) -> List[Tuple[str, str, int]]:
    """Read a whitespace-separated "<SMILES> <id>" file, subsampling if too large."""
    compounds: List[Tuple[str, str, int]] = []
    with open(path, "r", errors="ignore") as f:
        for i, line in enumerate(f):
            parts = line.split()
            if not parts:
                continue
            smiles = parts[0]
            compound_id = parts[1] if len(parts) > 1 else f"idx{i}"
            compounds.append((smiles, compound_id, label))

    if max_count is not None and len(compounds) > max_count:
        compounds = random.Random(seed).sample(compounds, max_count)

    return compounds


def _prepare_ligands_sdf(compounds: List[Tuple[str, str, int]], out_path: Path) -> Dict[str, int]:
    """
    Embed one 3D conformer per compound (standard benchmark protocol: one pose per
    compound, not the full tautomer/protomer enumeration the main pipeline does for
    a single user job - that keeps benchmark runtime bounded and reproducible).
    Ground truth label is encoded in the SDF molecule name so it survives the
    existing docking_service name-matching logic unchanged.
    """
    writer = Chem.SDWriter(str(out_path))
    prepared = 0
    failed = 0

    for smiles, compound_id, label in compounds:
        try:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                failed += 1
                continue

            mol = Chem.AddHs(mol)
            embedded = AllChem.EmbedMolecule(mol, AllChem.ETKDGv2()) == 0
            if not embedded:
                embedded = AllChem.EmbedMolecule(mol, useRandomCoords=True) == 0
            if not embedded:
                failed += 1
                continue

            try:
                AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
            except Exception:
                pass  # optimization failing isn't fatal, keep the embedded pose

            prefix = ACTIVE_PREFIX if label == 1 else DECOY_PREFIX
            compound_name = f"{prefix}{compound_id}"
            # DockingService._extract_drug_names_from_sdf() specifically looks for a
            # 'Name' SDF data field (mol.GetProp('Name')) - RDKit's private '_Name'
            # (the CTAB title line) is NOT picked up by that lookup, so both must be
            # set or the active/decoy label is silently lost and results come back
            # as "Unknown_Drug_N", which this module then can't score at all.
            mol.SetProp("_Name", compound_name)
            mol.SetProp("Name", compound_name)
            writer.write(mol)
            prepared += 1
        except Exception as e:
            logger.debug("Failed to prepare compound %s: %s", compound_id, e)
            failed += 1

    writer.close()
    return {"prepared": prepared, "failed": failed}


# ---------------------------------------------------------------------------
# Docking + scoring for a single target
# ---------------------------------------------------------------------------

def _run_docking_for_target(
    sdf_path: Path,
    receptor_path: Path,
    ref_ligand_path: Optional[Path],
    target_job_id: str,
    docking_overrides: Dict[str, Any],
) -> Dict[str, Any]:
    docking_service = DockingService()
    docking_params = {
        "center_x": docking_overrides.get("center_x", 0.0),
        "center_y": docking_overrides.get("center_y", 0.0),
        "center_z": docking_overrides.get("center_z", 0.0),
        "size_x": docking_overrides.get("size_x", 20.0),
        "size_y": docking_overrides.get("size_y", 20.0),
        "size_z": docking_overrides.get("size_z", 20.0),
        "exhaustiveness": docking_overrides.get("exhaustiveness", 8),
        "num_modes": docking_overrides.get("num_modes", 9),
    }

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            docking_service.run_parallel_docking(
                ligands_file=str(sdf_path),
                protein_file=str(receptor_path),
                job_id=target_job_id,
                docking_params=docking_params,
                ref_ligand_file=str(ref_ligand_path) if ref_ligand_path else None,
                # GNINA's CNN scoring is GPU-bound; running several instances at once
                # against the same GPU has been observed to hang indefinitely (each
                # process sits at ~0% CPU forever) rather than error out or queue.
                # gnina_local_service.py has a max_concurrent_jobs=1 guard for exactly
                # this, but it isn't actually wired into DockingService's thread pool -
                # until that's fixed at the source, serialize here so a benchmark run
                # reliably finishes instead of hanging on whichever machine runs it.
                max_workers=1,
            )
        )
    finally:
        loop.close()


def _run_single_target(
    run_id: str,
    target_id: str,
    target_meta: Dict[str, Any],
    max_actives: int,
    max_decoys: Optional[int],
    decoy_ratio: Optional[float],
    decoy_ratio_cap: Optional[int],
    rank_by: str,
    docking_overrides: Dict[str, Any],
    run_dir: Path,
) -> Dict[str, Any]:
    data_dir = Path(settings.BENCHMARK_DATA_DIR) / target_meta["target_name"]
    variant = target_meta["source"]
    files = _target_variants(data_dir).get(variant)
    if not files:
        raise ValueError(f"Target files missing for {target_id}")

    actives = _load_compounds(
        data_dir / files["actives_file"], label=1, max_count=max_actives, seed=settings.BENCHMARK_RANDOM_SEED
    )

    # Ratio-based decoy cap (used by "full_suite"): scale with how many actives this
    # target actually ended up with, so the effective enrichment ratio stays constant
    # across targets instead of a single flat number dominating small/huge targets
    # differently.
    effective_max_decoys = max_decoys
    if decoy_ratio is not None:
        ratio_cap = int(decoy_ratio * max(len(actives), 1))
        effective_max_decoys = min(ratio_cap, decoy_ratio_cap) if decoy_ratio_cap else ratio_cap

    decoys = _load_compounds(
        data_dir / files["decoys_file"], label=0, max_count=effective_max_decoys, seed=settings.BENCHMARK_RANDOM_SEED
    )
    if not actives or not decoys:
        raise ValueError(f"Not enough actives/decoys for {target_id} (actives={len(actives)}, decoys={len(decoys)})")

    target_slug = target_id.replace(":", "_")
    target_dir = run_dir / target_slug
    target_dir.mkdir(parents=True, exist_ok=True)
    sdf_path = target_dir / "ligands_3d.sdf"

    _prepare_ligands_sdf(actives + decoys, sdf_path)

    receptor_path, ref_ligand_path = _find_receptor_and_ref_ligand(data_dir)
    if receptor_path is None:
        raise ValueError(f"No usable receptor found for {target_id}")
    if ref_ligand_path is None:
        logger.warning("No reference ligand for %s, GNINA will fall back to its default box", target_id)

    docking_result = _run_docking_for_target(
        sdf_path=sdf_path,
        receptor_path=receptor_path,
        ref_ligand_path=ref_ligand_path,
        target_job_id=f"benchmark_{run_id}_{target_slug}",
        docking_overrides=docking_overrides,
    )
    if not docking_result.get("success"):
        raise RuntimeError(docking_result.get("error", "Docking failed"))

    raw_rows: List[Dict[str, Any]] = []
    affinity_scored: List[Tuple[float, int]] = []
    cnn_scored: List[Tuple[float, int]] = []
    processing_times: List[float] = []
    n_failed = 0

    for r in docking_result.get("results", []):
        name = r.get("drug_name", "") or ""
        if name.startswith(ACTIVE_PREFIX):
            label = 1
        elif name.startswith(DECOY_PREFIX):
            label = 0
        else:
            continue  # not one of ours, ignore defensively

        if r.get("processing_time"):
            processing_times.append(r["processing_time"])

        if not r.get("success"):
            n_failed += 1
            raw_rows.append({"name": name, "label": label, "affinity": None, "cnn_affinity": None, "success": False})
            continue

        affinity = r.get("best_affinity")
        # 'cnn_affinity' is populated by both GNINA output formats the parser
        # understands; 'cnn_score' only by the legacy one - prefer the reliable one.
        cnn_value = r.get("cnn_affinity")
        if cnn_value is None:
            cnn_value = r.get("cnn_score")

        if affinity is not None:
            affinity_scored.append((-affinity, label))  # more negative affinity = better
        if cnn_value is not None:
            cnn_scored.append((cnn_value, label))

        raw_rows.append({
            "name": name, "label": label, "affinity": affinity,
            "cnn_affinity": cnn_value, "success": True,
        })

    metrics: Dict[str, Any] = {}
    if rank_by in ("affinity", "both") and affinity_scored:
        metrics["affinity"] = compute_metrics(affinity_scored)
    if rank_by in ("cnn_score", "both") and cnn_scored:
        metrics["cnn_score"] = compute_metrics(cnn_scored)

    raw_scores_path = target_dir / "raw_scores.json"
    raw_scores_path.write_text(json.dumps(raw_rows, indent=2))

    return {
        "n_actives": len(actives),
        "n_decoys": len(decoys),
        "n_failed": n_failed,
        "metrics": metrics,
        "avg_processing_time_sec": statistics.mean(processing_times) if processing_times else None,
        "total_wallclock_sec": sum(processing_times) if processing_times else None,
        "raw_scores_path": str(raw_scores_path),
    }


# ---------------------------------------------------------------------------
# Run orchestration (Celery entry point)
# ---------------------------------------------------------------------------

def run_benchmark_sync(run_id: str, progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
    """
    Run every target in a BenchmarkRun sequentially. Called from the Celery task.

    Resume-safe: targets that already have a COMPLETED BenchmarkTargetResult row
    for this run_id are skipped. That means re-invoking this function with the
    same run_id - whether via the /resume endpoint or because a crashed worker
    got restarted by systemd and the run got re-dispatched - picks up where it
    left off instead of redoing finished work. Previously FAILED targets are
    retried (a fresh row is created for the new attempt).
    """
    with get_sync_database() as db:
        run = db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id)).scalar_one_or_none()
        if not run:
            raise ValueError(f"Benchmark run {run_id} not found")

        config = run.config or {}
        target_ids: List[str] = config.get("targets", [])
        max_actives = config.get("max_actives_per_target", 100)
        max_decoys = config.get("max_decoys_per_target")
        decoy_ratio = config.get("decoy_ratio")
        decoy_ratio_cap = config.get("decoy_ratio_cap")
        rank_by = config.get("rank_by", "both")
        docking_overrides = config.get("docking_params", {})

        # Resume support: find targets already finished in a prior attempt at
        # this same run_id, and seed the completed/failed counters from them
        # instead of starting back at zero.
        existing_rows = db.execute(
            select(BenchmarkTargetResult).where(BenchmarkTargetResult.run_id == run_id)
        ).scalars().all()
        # completed/failed count DISTINCT targets, not rows: every target_id not
        # already completed goes into remaining_target_ids below and gets a fresh
        # attempt this pass, so its outcome (completed or failed) is only ever
        # counted once, from that fresh attempt - never seeded again here.
        already_completed_target_ids = set()
        completed = 0
        for row in existing_rows:
            row_target_id = f"{row.target_name}:{row.dataset_source}" if row.dataset_source else row.target_name
            if row.status == BenchmarkStatus.COMPLETED:
                already_completed_target_ids.add(row_target_id)
                completed += 1
            elif row.status == BenchmarkStatus.RUNNING:
                # Orphaned from a prior attempt whose worker died mid-target (that's
                # exactly what triggers a resume in the first place) - close it out
                # for history's sake; this target still gets retried below.
                row.status = BenchmarkStatus.FAILED
                row.error_message = "Orphaned: worker did not report back (likely crashed or was killed)"
                row.completed_at = datetime.utcnow()
        failed = 0

        run.status = BenchmarkStatus.RUNNING
        if not run.started_at:
            run.started_at = datetime.utcnow()
        run.last_heartbeat = datetime.utcnow()
        run.total_targets = len(target_ids)
        run.completed_targets = completed
        run.failed_targets = failed
        db.commit()

    targets_by_id = {t["id"]: t for t in list_targets()}
    run_dir = Path(settings.RESULTS_DIR) / "benchmark" / str(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    total = len(target_ids) or 1
    remaining_target_ids = [t for t in target_ids if t not in already_completed_target_ids]
    if len(remaining_target_ids) < len(target_ids):
        logger.info(
            "Resuming benchmark run %s: skipping %d already-completed target(s)",
            run_id, len(target_ids) - len(remaining_target_ids),
        )

    for target_id in remaining_target_ids:
        target_meta = targets_by_id.get(target_id)

        with get_sync_database() as db:
            target_row = BenchmarkTargetResult(
                run_id=run_id,
                target_name=target_meta["target_name"] if target_meta else target_id,
                dataset_source=target_meta["source"] if target_meta else None,
                status=BenchmarkStatus.RUNNING,
                started_at=datetime.utcnow(),
            )
            db.add(target_row)
            db.commit()
            db.refresh(target_row)
            target_row_id = target_row.id

        try:
            if not target_meta:
                raise ValueError(f"Unknown benchmark target id: {target_id}")

            summary = _run_single_target(
                run_id=str(run_id),
                target_id=target_id,
                target_meta=target_meta,
                max_actives=max_actives,
                max_decoys=max_decoys,
                decoy_ratio=decoy_ratio,
                decoy_ratio_cap=decoy_ratio_cap,
                rank_by=rank_by,
                docking_overrides=docking_overrides,
                run_dir=run_dir,
            )
            with get_sync_database() as db:
                row = db.execute(
                    select(BenchmarkTargetResult).where(BenchmarkTargetResult.id == target_row_id)
                ).scalar_one()
                row.status = BenchmarkStatus.COMPLETED
                row.n_actives = summary["n_actives"]
                row.n_decoys = summary["n_decoys"]
                row.n_failed = summary["n_failed"]
                row.metrics = summary["metrics"]
                row.avg_processing_time_sec = summary["avg_processing_time_sec"]
                row.total_wallclock_sec = summary["total_wallclock_sec"]
                row.raw_scores_path = summary["raw_scores_path"]
                row.completed_at = datetime.utcnow()
                db.commit()
            completed += 1

        except Exception as e:
            logger.error("Benchmark target %s failed: %s", target_id, e, exc_info=True)
            with get_sync_database() as db:
                row = db.execute(
                    select(BenchmarkTargetResult).where(BenchmarkTargetResult.id == target_row_id)
                ).scalar_one()
                row.status = BenchmarkStatus.FAILED
                row.error_message = str(e)
                row.completed_at = datetime.utcnow()
                db.commit()
            failed += 1

        with get_sync_database() as db:
            run_row = db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id)).scalar_one()
            run_row.completed_targets = completed
            run_row.failed_targets = failed
            run_row.last_heartbeat = datetime.utcnow()
            db.commit()

        if progress_callback:
            progress_callback({
                "completed": completed + failed,
                "total": total,
                "percentage": (completed + failed) / total * 100,
                "status": f"Finished {target_id}",
            })

    with get_sync_database() as db:
        run_row = db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id)).scalar_one()
        run_row.status = BenchmarkStatus.COMPLETED if completed > 0 else BenchmarkStatus.FAILED
        run_row.completed_at = datetime.utcnow()
        run_row.last_heartbeat = datetime.utcnow()
        db.commit()

    return {"success": True, "run_id": str(run_id), "completed": completed, "failed": failed}
