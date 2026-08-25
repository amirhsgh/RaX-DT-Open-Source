"""
Tools the chat agent can actually act with - so a clinician can run a
docking job by chatting instead of driving the job-creation UI by hand.

Files a user drops into the chat land in a per-session staging directory
(see chat_staging_dir) sorted into protein/ligand/ref_ligand subfolders by
detect_file_kind(). The agent reads that staging area through
list_uploaded_files() and turns it into a real ScreeningJob with
start_docking_job(), which reuses the exact same ScreeningJob fields and
Celery task the /jobs API uses - no parallel job path to keep in sync.
"""

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.tools import tool
from sqlalchemy import select

from app.core.config import settings
from app.database.connection import get_sync_database
from app.database.models import Project, ScreeningJob

logger = logging.getLogger(__name__)

# Extensions we will accept at all. Anything else is rejected before it
# touches disk - these are the only formats the docking pipeline can read,
# so a wider allowlist would only widen the attack surface for no benefit.
LIGAND_EXTENSIONS = {".sdf", ".mol", ".mol2", ".smi", ".smiles"}
STRUCTURE_EXTENSIONS = {".pdb", ".pdbqt"}
ALLOWED_EXTENSIONS = LIGAND_EXTENSIONS | STRUCTURE_EXTENSIONS

# A real receptor has hundreds of residues; a co-crystallised ligand pulled
# out as a .pdb has a handful. 30 sits far from both, so the split is not
# sensitive to where exactly it falls.
PROTEIN_MIN_RESIDUES = 30

FILE_KINDS = ("protein", "ligand", "ref_ligand")


def chat_staging_dir(user_id: str, session_id: str, kind: Optional[str] = None) -> Path:
    """Where this chat session's uploads live.

    user_id/session_id are used as path segments, so they are stripped of
    anything that could climb out of the staging root (they arrive from a
    request, even if the user_id itself is server-derived).
    """
    safe_user = "".join(c for c in str(user_id) if c.isalnum() or c in "-_")
    safe_session = "".join(c for c in str(session_id) if c.isalnum() or c in "-_")
    base = Path(settings.UPLOAD_DIR) / "chat_staging" / safe_user / safe_session
    return base / kind if kind else base


def _count_molecules(file_path: Path, ext: str) -> int:
    """Cheap molecule count by record separator - no chemistry toolkit needed
    just to tell 'one molecule' from 'many'."""
    try:
        text = file_path.read_text(errors="ignore")
    except OSError:
        return 1

    if ext == ".mol2":
        return text.count("@<TRIPOS>MOLECULE")
    if ext in {".sdf", ".mol"}:
        return text.count("$$$$") or 1
    return sum(1 for line in text.splitlines() if line.strip())


def detect_file_kind(file_path: Path, original_filename: str) -> str:
    """Work out whether an uploaded file is a receptor, a set of ligands, or
    a reference ligand - so the user can just drop a file in the chat without
    having to know which upload slot it belongs to.

    Returns one of FILE_KINDS, or "unknown" if the extension isn't supported.
    """
    ext = Path(original_filename).suffix.lower()

    if ext in LIGAND_EXTENSIONS:
        # A ligand-format file holding exactly one molecule is almost always
        # the co-crystallised reference ligand (used to centre the search
        # box), not a compound set to screen - nobody screens a library of
        # one. More than one molecule means it is the set to dock.
        return "ligand" if _count_molecules(file_path, ext) > 1 else "ref_ligand"

    if ext in STRUCTURE_EXTENSIONS:
        # Distinguish a receptor from a single small molecule stored in the
        # same format by how many distinct residues it contains.
        residues = set()
        try:
            with open(file_path, "r", errors="ignore") as f:
                for line in f:
                    if line.startswith(("ATOM", "HETATM")) and len(line) > 27:
                        # chain + resSeq + iCode identifies a residue instance
                        residues.add(line[21:27])
        except OSError as e:
            logger.warning("Could not read %s to classify it: %s", file_path, e)
            return "protein" if ext == ".pdbqt" else "unknown"

        return "protein" if len(residues) >= PROTEIN_MIN_RESIDUES else "ref_ligand"

    return "unknown"


def store_staged_file(
    user_id: str, session_id: str, kind: str, content: bytes, original_filename: str
) -> Path:
    """Save an already-validated upload into the session staging area.

    The stored name is uuid-based rather than user-supplied, so a hostile
    filename cannot traverse out of the staging directory or collide with
    another upload. The original name is kept only as a suffix for display.
    """
    ext = Path(original_filename).suffix.lower()
    target_dir = chat_staging_dir(user_id, session_id, kind)
    target_dir.mkdir(parents=True, exist_ok=True)

    display_name = Path(original_filename).name.replace("/", "_").replace("\\", "_")
    path = target_dir / f"{uuid.uuid4().hex}__{display_name}"
    path.write_bytes(content)
    return path


def _staged_files(user_id: str, session_id: str) -> dict:
    """{kind: [paths]} for everything staged in this session."""
    out = {}
    for kind in FILE_KINDS:
        d = chat_staging_dir(user_id, session_id, kind)
        out[kind] = sorted(d.glob("*")) if d.is_dir() else []
    return out


def receptor_center(receptor_path: Path) -> Optional[Tuple[float, float, float]]:
    """Geometric centre of a receptor's atoms, for use as a blind-docking box
    centre when the user gave no reference ligand.

    Without this the job falls back to fixed default coordinates, which sit in
    empty space for any receptor that is not positioned exactly like the one
    those defaults came from. Seen live: GNINA returned 0.00 kcal/mol for
    every pose because the ligand was being docked into vacuum, and the job
    still reported "completed".
    """
    xs, ys, zs = [], [], []
    try:
        with open(receptor_path, "r", errors="ignore") as f:
            for line in f:
                if not line.startswith(("ATOM", "HETATM")) or len(line) < 54:
                    continue
                try:
                    xs.append(float(line[30:38]))
                    ys.append(float(line[38:46]))
                    zs.append(float(line[46:54]))
                except ValueError:
                    continue
    except OSError as e:
        logger.warning("Could not read receptor to find its centre: %s", e)
        return None

    if not xs:
        return None
    return (sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs))


def _combine_ligand_files(sources: List[Path], out_dir: Path) -> Path:
    """Merge every staged ligand file into one SDF for the job to screen.

    A single file is copied as-is (no format conversion, so a .smi stays a
    .smi and is read by LigandProcessor's format-aware reader). Several files
    - or mixed formats - are parsed and written out as one SDF, since a job
    carries exactly one ligand path.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    if len(sources) == 1:
        dst = out_dir / sources[0].name
        shutil.copy2(sources[0], dst)
        return dst

    from rdkit import Chem
    from app.services.ligand_processor import LigandProcessor

    dst = out_dir / "combined_ligands.sdf"
    writer = Chem.SDWriter(str(dst))
    try:
        for src in sources:
            for mol in LigandProcessor._read_input_molecules(str(src)):
                writer.write(mol)
    finally:
        writer.close()
    return dst


def _display_name(path: Path) -> str:
    """Strip the uuid prefix back off for showing to the user."""
    return path.name.split("__", 1)[-1]


def build_agent_tools(user_id: str, session_id: str) -> List:
    """Tools bound to one user + chat session.

    Built per-conversation (rather than module-level) so a tool can never be
    invoked without knowing whose files and jobs it is allowed to touch -
    the agent never gets to pass a user_id itself.
    """

    @tool
    def list_uploaded_files() -> str:
        """List the files the user has uploaded in this chat, grouped by what
        they were detected as (protein receptor, ligands, reference ligand).
        Use this to check what is available before starting a docking job."""
        staged = _staged_files(user_id, session_id)
        if not any(staged.values()):
            return (
                "No files uploaded yet in this chat. The user can attach a file "
                "with the paperclip button or by dragging it into the chat. "
                "A docking job needs at least a protein receptor (.pdb/.pdbqt) "
                "and a ligand file (.sdf/.mol2/.smi)."
            )

        lines = []
        for kind in FILE_KINDS:
            names = [_display_name(p) for p in staged[kind]]
            lines.append(f"{kind}: {', '.join(names) if names else '(none)'}")
        return "\n".join(lines)

    @tool
    def list_recent_jobs() -> str:
        """List this user's recent docking jobs with their status and progress.
        Use this when the user asks what is running, or how a job is going."""
        with get_sync_database() as db:
            jobs = db.execute(
                select(ScreeningJob)
                .join(Project, ScreeningJob.project_id == Project.id)
                .where(Project.user_id == user_id)
                .order_by(ScreeningJob.created_at.desc())
                .limit(10)
            ).scalars().all()

            if not jobs:
                return "This user has no docking jobs yet."

            return "\n".join(
                f"- {j.name} (id={j.id}): {j.status}, stage={j.current_stage}, "
                f"{j.progress_percentage:.0f}% done, "
                f"{j.processed_ligands}/{j.total_ligands} ligands"
                for j in jobs
            )

    @tool
    def get_job_details(job_id: str) -> str:
        """Get the full status of one docking job by its id, including any
        error message. Use this when the user asks about a specific job."""
        with get_sync_database() as db:
            try:
                job_uuid = uuid.UUID(job_id)
            except ValueError:
                return f"'{job_id}' is not a valid job id."

            job = db.execute(
                select(ScreeningJob)
                .join(Project, ScreeningJob.project_id == Project.id)
                .where(ScreeningJob.id == job_uuid, Project.user_id == user_id)
            ).scalar_one_or_none()

            if not job:
                return "No such job for this user."

            return (
                f"name={job.name}\nstatus={job.status}\nstage={job.current_stage}\n"
                f"progress={job.progress_percentage:.0f}%\n"
                f"ligands processed={job.processed_ligands}/{job.total_ligands}\n"
                f"failed={job.failed_ligands}\n"
                f"created={job.created_at}\nstarted={job.started_at}\n"
                f"completed={job.completed_at}\nerror={job.error_message or 'none'}"
            )

    @tool
    def start_docking_job(job_name: str = "Chat docking job") -> str:
        """Create and immediately start a docking job from the files the user
        uploaded in this chat. Requires a protein receptor and a ligand file to
        have been uploaded already - check with list_uploaded_files first.
        Only call this after the user has confirmed they want to run it."""
        staged = _staged_files(user_id, session_id)

        if not staged["protein"]:
            return "Cannot start: no protein receptor uploaded yet. Ask the user to upload one (.pdb or .pdbqt)."
        if not staged["ligand"]:
            return "Cannot start: no ligand file uploaded yet. Ask the user to upload one (.sdf, .mol2 or .smi)."

        protein_src = staged["protein"][-1]
        ligand_sources = staged["ligand"]
        ref_src = staged["ref_ligand"][-1] if staged["ref_ligand"] else None

        with get_sync_database() as db:
            project = db.execute(
                select(Project).where(
                    Project.user_id == user_id, Project.name == "Chat Assistant"
                )
            ).scalar_one_or_none()

            if not project:
                project = Project(
                    user_id=user_id,
                    name="Chat Assistant",
                    description="Jobs created through the chat assistant",
                )
                db.add(project)
                db.commit()
                db.refresh(project)

            job = ScreeningJob(
                project_id=project.id,
                name=job_name,
                config={"created_via": "chat_agent", "chat_session_id": session_id},
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            job_id = job.id

            # Copy the staged files under the job's own upload dir so the job
            # owns its inputs and stays reproducible even if the chat session
            # staging area is later cleared.
            job_dir = Path(settings.UPLOAD_DIR) / str(job_id)
            (job_dir / "protein").mkdir(parents=True, exist_ok=True)
            (job_dir / "ligands").mkdir(parents=True, exist_ok=True)

            protein_dst = job_dir / "protein" / protein_src.name
            shutil.copy2(protein_src, protein_dst)
            job.protein_file_path = str(protein_dst)

            # Screen everything the user staged, not just the newest file -
            # they may have uploaded a set AND picked compounds from the
            # library. A job takes a single ligand path, so mixed formats are
            # normalised into one SDF.
            ligand_dst = _combine_ligand_files(ligand_sources, job_dir / "ligands")
            job.ligand_file_path = str(ligand_dst)

            blind_center = None
            if ref_src:
                ref_dst = job_dir / "protein" / ref_src.name
                shutil.copy2(ref_src, ref_dst)
                job.ref_ligand_file_path = str(ref_dst)
            else:
                # No reference ligand, so nothing tells GNINA where the pocket
                # is. Centre a generous box on the whole receptor rather than
                # letting the pipeline fall back to fixed coordinates that sit
                # off the protein entirely.
                blind_center = receptor_center(protein_dst)
                if blind_center:
                    job.center_x, job.center_y, job.center_z = blind_center
                    job.size_x = job.size_y = job.size_z = 30.0

            # The /uploads/ligands endpoint records this from its validator;
            # without it the job reports 0 ligands and progress never makes
            # sense in the UI.
            from app.services.ligand_processor import LigandProcessor
            job.total_ligands = len(LigandProcessor._read_input_molecules(str(ligand_dst)))

            job.status = "running"
            job.current_stage = "ligand_prep_3d"
            from datetime import datetime
            job.started_at = datetime.utcnow()
            db.commit()

        # Dispatch outside the DB session, mirroring POST /jobs/{id}/start.
        from app.tasks.screening_tasks import run_screening_pipeline
        task = run_screening_pipeline.delay(str(job_id))

        with get_sync_database() as db:
            job = db.execute(
                select(ScreeningJob).where(ScreeningJob.id == job_id)
            ).scalar_one()
            job.celery_task_id = task.id
            db.commit()

        if ref_src:
            box_note = "Search box centred automatically on the reference ligand."
        elif blind_center:
            box_note = (
                "No reference ligand, so this is a BLIND docking run: a 30 A box centred on "
                "the whole receptor. Warn the user that blind docking is much less reliable "
                "than pocket-directed docking, and that adding the known bound ligand would "
                "target the real binding site."
            )
        else:
            box_note = (
                "WARNING: no reference ligand and the receptor's centre could not be "
                "determined, so the search box may not cover the binding site. Tell the user "
                "the scores may be meaningless and they should add the known bound ligand."
            )
        return (
            f"Started docking job '{job_name}' (id={job_id}).\n"
            f"Receptor: {_display_name(protein_src)}\n"
            f"Compound sources: {', '.join(_display_name(p) for p in ligand_sources)}\n"
            f"{box_note}\n"
            "It now appears in the Running jobs panel; progress updates there automatically."
        )

    return [
        list_uploaded_files,
        list_recent_jobs,
        get_job_details,
        start_docking_job,
    ]
