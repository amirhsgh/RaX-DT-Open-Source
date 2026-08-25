"""
Redocking (pose-accuracy) validation service.

Different question from benchmark_service.py's enrichment metrics (can the
pipeline rank a known binder above decoys) - this asks whether it can
reproduce the *correct pose* at all: take a protein's own co-crystallized
ligand, throw away its crystal coordinates and re-generate a fresh 3D
conformer from its 2D structure (SMILES) - a real, unbiased starting guess,
not "start from the answer" - dock it back in with the crystal ligand only
used to center the search box (--autobox_ligand, same mechanism
benchmark_service.py already uses), and measure the RMSD between the
top-ranked docked pose and the original crystal pose. RMSD <= 2 Angstrom is
the standard "success" threshold in the docking literature.

Self-contained, same spirit as benchmark_service.py: reuses DockingService
unchanged, doesn't touch ScreeningJob/Ligand/DockingResult, own DB tables.
"""

import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import requests
from rdkit import Chem
from rdkit.Chem import AllChem
from sqlalchemy import select

from app.core.config import settings
from app.database.connection import get_sync_database
from app.database.models import RedockingRun, RedockingStatus, RedockingTargetResult
from app.services.docking_service import DockingService

logger = logging.getLogger(__name__)

# A diverse, hand-picked redocking set spanning protease/kinase/nuclear-
# receptor/enzyme/GPCR-adjacent targets - all well-characterized co-crystal
# structures commonly cited in the docking literature. This is NOT literally
# the CASF-2016 core set or the Astex Diverse Set (those require their exact
# published PDB lists, not reproduced here) - it's a smaller, independently
# curated set intended for the same purpose: an SR0/SR5 pose-recovery check
# comparable in kind (not scale) to SwissDock's own 251-complex validation
# (Grosdidier et al. 2011, NAR).
DEFAULT_PDB_IDS = [
    "4HT2", "3EMG", "1KE9", "5OLH", "6O4W",
    "3PTB",  # trypsin / benzamidine - classic small-ligand protease case
    "1STP",  # streptavidin / biotin - very high affinity, simple ligand
    "1HVR",  # HIV-1 protease / XK263 cyclic urea inhibitor
    "3ERT",  # estrogen receptor ligand-binding domain / 4-hydroxytamoxifen
    "1M17",  # EGFR kinase domain / erlotinib
]

DEFAULT_RMSD_THRESHOLD = 2.0  # Angstrom - standard "success" cutoff

# HETATM residue names to never treat as "the ligand": water, common ions,
# and crystallization buffer/cryoprotectant molecules.
_NON_LIGAND_RESNAMES = {
    "HOH", "WAT", "DOD",
    "NA", "CL", "MG", "ZN", "CA", "K", "MN", "FE", "CO", "NI", "CU", "CD",
    "SO4", "PO4", "GOL", "EDO", "DMS", "ACT", "FMT", "TRS", "PEG", "PG4",
    "BME", "MPD", "IPA", "EOH", "IOD", "BR", "NH4", "UNK",
    # Membrane-protein crystallization additives (lipids/detergents/sugars) -
    # structural, not the drug-like binder a redocking test should target.
    # picking these instead of the real ligand was seen live on PDB 5OLH,
    # which auto-selected cholesterol (CLR) over the actual inhibitor because
    # it happened to have more atoms in a single instance.
    "CLR", "CDL", "Y01", "CHS", "LMG", "LMT", "LMU", "LHG", "BOG",
    "OLA", "OLB", "OLC", "PLM", "PLC", "P6G", "1PE", "PE4", "PE8",
    "NAG", "BMA", "MAN",
}


# ---------------------------------------------------------------------------
# PDB fetch + receptor/ligand extraction
# ---------------------------------------------------------------------------

def _pdb_cache_dir() -> Path:
    d = Path(settings.TEMP_DIR) / "redocking_pdb_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def download_pdb(pdb_id: str) -> Path:
    """Fetch a PDB file from RCSB, cached locally by ID."""
    pdb_id = pdb_id.strip().upper()
    cache_path = _pdb_cache_dir() / f"{pdb_id}.pdb"
    if cache_path.exists():
        return cache_path

    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200 or not resp.text.startswith(("HEADER", "OBSLTE", "TITLE")):
        raise ValueError(f"Could not fetch PDB {pdb_id} from RCSB (status {resp.status_code})")

    cache_path.write_text(resp.text)
    return cache_path


# A single (resname, chain, resSeq+iCode) HETATM group - the unit a ligand
# actually needs to be selected/extracted by. Selecting by resname alone
# breaks on any PDB entry with more than one copy of the complex in the
# asymmetric unit (common): every copy shares the same 3-letter code, so a
# resname-only filter silently merges N unrelated copies of the ligand into
# one nonsense multi-fragment "molecule".
LigandInstance = Tuple[str, str, str]  # (resname, chain, resseq_with_icode)


def _hetatm_instance_key(line: str) -> Tuple[str, str, str]:
    resname = line[17:20].strip()
    chain = line[21:22].strip()
    resseq = line[22:27].strip()  # resSeq (22:26) + iCode (26:27)
    return resname, chain, resseq


def _find_ligand_instances(pdb_path: Path) -> Dict[LigandInstance, int]:
    """Every distinct (resname, chain, resSeq) HETATM group and its atom
    count, excluding water/ions/buffers."""
    counts: Dict[LigandInstance, int] = {}
    with open(pdb_path, "r", errors="ignore") as f:
        for line in f:
            if not line.startswith("HETATM"):
                continue
            key = _hetatm_instance_key(line)
            if key[0] in _NON_LIGAND_RESNAMES:
                continue
            counts[key] = counts.get(key, 0) + 1
    return counts


def pick_ligand_instance(pdb_path: Path, requested_resname: Optional[str]) -> LigandInstance:
    """Auto-detect the co-crystallized ligand instance: the largest single
    HETATM group that isn't water/a buffer/ion. If a resname is requested,
    picks the largest instance *of that resname* (still a single instance,
    not all copies merged)."""
    instances = _find_ligand_instances(pdb_path)
    if not instances:
        raise ValueError(
            "No candidate co-crystallized ligand found (only water/ions/buffers in HETATM records)"
        )

    if requested_resname:
        requested_resname = requested_resname.strip().upper()
        candidates = {k: v for k, v in instances.items() if k[0] == requested_resname}
        if not candidates:
            raise ValueError(f"No HETATM instance of residue '{requested_resname}' found")
        return max(candidates, key=candidates.get)

    return max(instances, key=instances.get)


def _keep_primary_altloc(lines: List[str]) -> List[str]:
    """
    Disordered atoms/residues get one PDB record per alternate conformation
    (altLoc column, e.g. blank/A/B/C), all at full atom-name+residue identity
    but different coordinates and <1.0 occupancy. Keeping all of them makes a
    single logical structure look like several overlapping copies smashed
    together - bond perception (obabel) chokes on that and produces garbage
    (seen live: a real ligand came out as several disconnected fragments).
    Keep exactly one conformation per residue: blank altLoc if present,
    otherwise that residue's alphabetically-first lettered one. Computed per
    residue (not globally) since different residues in the same file can use
    different altLoc letters for their "primary" conformation.
    """
    by_residue: Dict[Tuple[str, str], List[str]] = {}
    for line in lines:
        key = (line[21:22], line[22:27]) if len(line) > 26 else ("", "")
        by_residue.setdefault(key, []).append(line)

    kept: List[str] = []
    for residue_lines in by_residue.values():
        altlocs_present = {line[16] for line in residue_lines if len(line) > 16}
        keep = " " if " " in altlocs_present else min((c for c in altlocs_present if c != " "), default=" ")
        kept.extend(line for line in residue_lines if len(line) <= 16 or line[16] in (" ", keep))
    return kept


def extract_receptor_and_ligand(
    pdb_path: Path, ligand_instance: LigandInstance, out_dir: Path
) -> Tuple[Path, Path]:
    """Split a PDB file into receptor-only (standard ATOM records) and the
    one chosen ligand instance's HETATM records - a single conformation of
    each, alternate locations collapsed to one (see _keep_primary_altloc)."""
    receptor_path = out_dir / "receptor.pdb"
    ligand_path = out_dir / "ligand.pdb"

    receptor_lines = []
    ligand_lines = []
    with open(pdb_path, "r", errors="ignore") as f:
        for line in f:
            if line.startswith("ATOM"):
                receptor_lines.append(line)
            elif line.startswith("HETATM") and _hetatm_instance_key(line) == ligand_instance:
                ligand_lines.append(line)
            elif line.startswith("TER"):
                receptor_lines.append(line)

    if not ligand_lines:
        raise ValueError(f"No HETATM records found for ligand instance {ligand_instance}")

    receptor_lines = _keep_primary_altloc(receptor_lines)
    ligand_lines = _keep_primary_altloc(ligand_lines)

    receptor_path.write_text("".join(receptor_lines) + "END\n")
    ligand_path.write_text("".join(ligand_lines) + "END\n")
    return receptor_path, ligand_path


def ligand_pdb_to_smiles(ligand_pdb_path: Path) -> str:
    """Perceive bonds/get a SMILES for the crystal ligand from its raw PDB
    HETATM coordinates (no CONECT records to rely on)."""
    result = subprocess.run(
        [settings.OBABEL_PATH or "obabel", str(ligand_pdb_path), "-osmi"],
        capture_output=True, text=True, timeout=30,
    )
    smiles = result.stdout.strip().split()[0] if result.stdout.strip() else None
    if not smiles:
        raise RuntimeError(f"Could not derive a SMILES for the ligand: {result.stderr[:300]}")
    return smiles


def crystal_ligand_as_sdf(ligand_pdb_path: Path, out_sdf_path: Path) -> None:
    """Convert the crystal ligand's own PDB coordinates to SDF (for RMSD
    comparison against the docked pose later) - keeps the true 3D geometry,
    unlike the SMILES round-trip used for the redocking starting point."""
    subprocess.run(
        [settings.OBABEL_PATH or "obabel", str(ligand_pdb_path), "-osdf", "-O", str(out_sdf_path)],
        capture_output=True, text=True, timeout=30, check=True,
    )


# ---------------------------------------------------------------------------
# Fresh conformer generation (the "randomization" - a real blind starting
# guess instead of the crystal coordinates)
# ---------------------------------------------------------------------------

def embed_fresh_conformer(smiles: str, compound_name: str, out_sdf_path: Path) -> None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"RDKit could not parse ligand SMILES: {smiles}")

    mol = Chem.AddHs(mol)
    embedded = AllChem.EmbedMolecule(mol, AllChem.ETKDGv2()) == 0
    if not embedded:
        embedded = AllChem.EmbedMolecule(mol, useRandomCoords=True) == 0
    if not embedded:
        raise RuntimeError("RDKit could not embed a 3D conformer for the ligand")

    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    except Exception:
        pass

    mol.SetProp("_Name", compound_name)
    mol.SetProp("Name", compound_name)  # see benchmark_service.py for why both are set
    writer = Chem.SDWriter(str(out_sdf_path))
    writer.write(mol)
    writer.close()


# ---------------------------------------------------------------------------
# RMSD
# ---------------------------------------------------------------------------

def _load_mols_for_bond_order_reassignment(sdf_path: Path, limit: int) -> List[Chem.Mol]:
    """Load up to `limit` molecule blocks (in file order - GNINA's own pose
    ranking, best first) from an obabel-produced SDF for later
    AssignBondOrdersFromTemplate() use. obabel's distance-based bond
    perception routinely assigns a bond order that overstates a nitrogen's
    valence (e.g. a protonated guanidinium/amidinium N, common in kinase
    inhibitors) - full sanitization then rejects the whole molecule (seen
    live: "Explicit valence for atom # N is greater than permitted" on every
    pose of PDB 1KE9's ligand). Bond order is about to be discarded and
    replaced from the SMILES template anyway, so valence checking is
    pointless here - sanitize everything except that.
    """
    mols: List[Chem.Mol] = []
    suppl = Chem.SDMolSupplier(str(sdf_path), removeHs=False, sanitize=False)
    for mol in suppl:
        if len(mols) >= limit:
            break
        if mol is None:
            continue
        try:
            Chem.SanitizeMol(mol, sanitizeOps=Chem.SANITIZE_ALL ^ Chem.SANITIZE_PROPERTIES)
        except Exception:
            continue
        mols.append(Chem.RemoveHs(mol, sanitize=False))
    return mols


def compute_rmsd_multi(
    docked_pose_path: Path, crystal_sdf_path: Path, smiles: str, top_n: int = 5,
) -> List[Optional[float]]:
    """Heavy-atom, symmetry-aware RMSD between each of the top-N docked poses
    (GNINA's own ranking, best first) and the crystal pose - one RMSD per
    pose rank, so callers can derive both SR0 (rank-1 success) and SR5 (best
    RMSD among ranks 1-5), matching the definitions SwissDock's own
    validation reports (Grosdidier et al. 2011, NAR) use, for a directly
    comparable number. GNINA's output is PDBQT; convert to SDF first since
    RDKit doesn't read PDBQT.

    The docked poses and the crystal ligand are bond-perceived independently
    by obabel (distances in the PDBQT vs. distances in the crystal PDB), which
    can disagree on bond order/aromaticity even when the underlying heavy-atom
    connectivity is identical - and that alone makes RDKit's substructure-match
    RMS calculation raise "No sub-structure match found" (seen live). Reassign
    every molecule's bond orders from the same canonical template (the SMILES
    used to build the redocking starting conformer) so they all describe the
    same molecular graph before comparing coordinates.
    """
    # docking_service.py writes GNINA's PDBQT output to a path that ends in
    # ".sdf" (misleadingly - the content is PDBQT, not SDF). obabel picks the
    # parser by file extension unless told otherwise, so without -ipdbqt it
    # silently misreads this as SDF and emits an empty molecule (seen live:
    # 0 atoms, no error). Force the true input format explicitly.
    docked_sdf = docked_pose_path.with_suffix(".rmsd_check.sdf")
    subprocess.run(
        [settings.OBABEL_PATH or "obabel", "-ipdbqt", str(docked_pose_path), "-osdf", "-O", str(docked_sdf)],
        capture_output=True, text=True, timeout=30, check=True,
    )

    docked_raw_list = _load_mols_for_bond_order_reassignment(docked_sdf, limit=top_n)
    crystal_raw = _load_mols_for_bond_order_reassignment(crystal_sdf_path, limit=1)
    if not docked_raw_list or not crystal_raw:
        raise RuntimeError("Could not load docked pose(s) or crystal ligand for RMSD comparison")
    crystal_raw = crystal_raw[0]

    template = Chem.MolFromSmiles(smiles)
    if template is None:
        raise RuntimeError(f"Could not re-parse ligand SMILES for RMSD template: {smiles}")
    template = Chem.RemoveHs(template)

    try:
        crystal_mol = AllChem.AssignBondOrdersFromTemplate(template, crystal_raw)
    except ValueError as exc:
        raise RuntimeError(
            "Crystal ligand heavy-atom connectivity does not match the "
            f"expected ligand graph (SMILES={smiles}): {exc}"
        )
    crystal_match = crystal_mol.GetSubstructMatch(template)
    if not crystal_match:
        raise RuntimeError(
            f"Could not map the crystal ligand onto the expected ligand graph (SMILES={smiles})"
        )
    crystal_conf = crystal_mol.GetConformer()
    crystal_coords = np.array([list(crystal_conf.GetAtomPosition(i)) for i in crystal_match])

    # AssignBondOrdersFromTemplate preserves each mol's own atom ordering, so
    # the docked and crystal mols aren't guaranteed to list atoms in the same
    # order as each other - RDKit's cross-mol GetBestRMS() tries to
    # re-discover that correspondence via substructure isomorphism and can
    # fail on harmless kekulization differences between two independently-
    # perceived structures (seen live: "No sub-structure match found" even
    # though both mols independently matched the template fine). Anchor both
    # to the template's atom order instead, then minimize RMSD over the
    # template's own symmetry automorphisms (e.g. ring flips) to stay
    # meaningful for symmetric ligands.
    automorphisms = template.GetSubstructMatches(template, uniquify=False, useChirality=False)

    rmsds: List[Optional[float]] = []
    for docked_raw in docked_raw_list:
        try:
            docked_mol = AllChem.AssignBondOrdersFromTemplate(template, docked_raw)
        except ValueError:
            rmsds.append(None)
            continue
        docked_match = docked_mol.GetSubstructMatch(template)
        if not docked_match:
            rmsds.append(None)
            continue
        docked_conf = docked_mol.GetConformer()
        docked_coords = np.array([list(docked_conf.GetAtomPosition(i)) for i in docked_match])

        best_rmsd = None
        for automorph in automorphisms:
            permuted = crystal_coords[list(automorph)]
            rmsd = float(np.sqrt(((docked_coords - permuted) ** 2).sum(axis=1).mean()))
            if best_rmsd is None or rmsd < best_rmsd:
                best_rmsd = rmsd
        rmsds.append(best_rmsd)

    if not any(r is not None for r in rmsds):
        raise RuntimeError("Could not compute RMSD for any of the docked poses")
    return rmsds


# ---------------------------------------------------------------------------
# Per-target orchestration
# ---------------------------------------------------------------------------

def _run_docking_single(
    sdf_path: Path, receptor_path: Path, ref_ligand_path: Path,
    target_job_id: str, docking_overrides: Dict[str, Any],
) -> Dict[str, Any]:
    import asyncio

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
                ref_ligand_file=str(ref_ligand_path),
                max_workers=1,  # single ligand anyway; matches benchmark_service.py's GPU-safety default
            )
        )
    finally:
        loop.close()


def run_single_redocking_target(
    run_id: str,
    pdb_id: str,
    ligand_resname_override: Optional[str],
    rmsd_threshold: float,
    docking_overrides: Dict[str, Any],
    run_dir: Path,
) -> Dict[str, Any]:
    target_dir = run_dir / pdb_id
    target_dir.mkdir(parents=True, exist_ok=True)

    pdb_path = download_pdb(pdb_id)
    ligand_instance = pick_ligand_instance(pdb_path, ligand_resname_override)
    ligand_resname = ligand_instance[0]
    receptor_path, crystal_ligand_pdb = extract_receptor_and_ligand(pdb_path, ligand_instance, target_dir)

    crystal_sdf = target_dir / "crystal_ligand.sdf"
    crystal_ligand_as_sdf(crystal_ligand_pdb, crystal_sdf)

    smiles = ligand_pdb_to_smiles(crystal_ligand_pdb)
    fresh_conformer_sdf = target_dir / "fresh_conformer.sdf"
    embed_fresh_conformer(smiles, f"{pdb_id}_{ligand_resname}", fresh_conformer_sdf)

    docking_result = _run_docking_single(
        sdf_path=fresh_conformer_sdf,
        receptor_path=receptor_path,
        ref_ligand_path=crystal_ligand_pdb,
        target_job_id=f"redocking_{run_id}_{pdb_id}",
        docking_overrides=docking_overrides,
    )
    if not docking_result.get("success") or not docking_result.get("results"):
        raise RuntimeError(docking_result.get("error", "Docking produced no results"))

    result = docking_result["results"][0]
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Docking failed for this ligand"))

    docked_pose_path = Path(result["output_file"])
    # SR0/SR5, same definitions as SwissDock's own published validation
    # (Grosdidier et al. 2011, NAR): SR0 = top-ranked pose within threshold,
    # SR5 = best of the 5 most-favorable ranked poses within threshold.
    pose_rmsds = compute_rmsd_multi(docked_pose_path, crystal_sdf, smiles, top_n=5)
    rmsd = pose_rmsds[0]
    valid_top5 = [r for r in pose_rmsds[:5] if r is not None]
    rmsd_sr5 = min(valid_top5) if valid_top5 else None

    return {
        "ligand_resname": ligand_resname,
        "rmsd": rmsd,
        "success": rmsd is not None and rmsd <= rmsd_threshold,
        "rmsd_sr5": rmsd_sr5,
        "success_sr5": rmsd_sr5 is not None and rmsd_sr5 <= rmsd_threshold,
        "best_affinity": result.get("best_affinity"),
        "cnn_affinity": result.get("cnn_affinity") or result.get("cnn_score"),
        "processing_time_sec": result.get("processing_time"),
        "docked_pose_path": str(docked_pose_path),
        "crystal_ligand_path": str(crystal_sdf),
    }


# ---------------------------------------------------------------------------
# Local-dataset source - reuses the same BENCHMARK_DATA_DIR (DUD-E + LIT-PCBA)
# already on disk for the enrichment benchmark, instead of fetching fresh PDB
# entries from RCSB. Two advantages over the RCSB-id path: (1) zero internet
# dependency and zero risk of a hallucinated/typo'd PDB id - every entry here
# is a file that already exists on disk and was already used successfully in
# real docking runs; (2) these are .mol2 files with real, explicit bond
# orders (unlike a raw PDB's HETATM-only records), which sidesteps the whole
# class of "obabel guessed the wrong bond order from atom distances" failures
# that show up on the RCSB path (e.g. PDB 3EMG's ligand). Unlike
# benchmark_service.py's list_targets() (which picks exactly one
# representative structure per LIT-PCBA target for enrichment scoring), this
# enumerates *every* available structure - each is an independent pose-
# recovery test case in its own right.
# ---------------------------------------------------------------------------

def list_dataset_redocking_targets() -> List[Dict[str, Any]]:
    """Every (receptor, ligand) pair available under BENCHMARK_DATA_DIR.

    DUD-E-style folders contribute one entry (`receptor.pdb` +
    `crystal_ligand.mol2`), identifier = the folder name (e.g. "ampc").
    LIT-PCBA-style folders contribute one entry per `<pdbid>_protein.mol2` /
    `<pdbid>_ligand.mol2` pair they ship, identifier = "<folder>:<pdbid>"
    (e.g. "ESR1_ago:3p0g").
    """
    data_dir = Path(settings.BENCHMARK_DATA_DIR)
    if not data_dir.exists():
        return []

    entries: List[Dict[str, Any]] = []
    for target_dir in sorted(data_dir.iterdir()):
        if not target_dir.is_dir():
            continue

        receptor = target_dir / "receptor.pdb"
        crystal_ligand = target_dir / "crystal_ligand.mol2"
        if receptor.exists() and crystal_ligand.exists():
            entries.append({
                "identifier": target_dir.name,
                "receptor_path": receptor,
                "ligand_path": crystal_ligand,
            })

        for ligand_file in sorted(target_dir.glob("*_ligand.mol2")):
            pdb_id = ligand_file.name[: -len("_ligand.mol2")]
            protein_file = target_dir / f"{pdb_id}_protein.mol2"
            if protein_file.exists():
                entries.append({
                    "identifier": f"{target_dir.name}:{pdb_id}",
                    "receptor_path": protein_file,
                    "ligand_path": ligand_file,
                })

    return entries


def run_single_dataset_redocking_target(
    identifier: str,
    receptor_path: Path,
    ligand_mol2_path: Path,
    rmsd_threshold: float,
    docking_overrides: Dict[str, Any],
    run_dir: Path,
) -> Dict[str, Any]:
    """Same pose-recovery pipeline as run_single_redocking_target(), starting
    from an already-on-disk (receptor, ligand.mol2) pair instead of an RCSB
    PDB id - skips the download + raw-PDB ligand-instance-extraction steps
    entirely since the ligand is already cleanly separated with real bond
    orders."""
    target_dir = run_dir / identifier.replace(":", "_")
    target_dir.mkdir(parents=True, exist_ok=True)

    crystal_sdf = target_dir / "crystal_ligand.sdf"
    crystal_ligand_as_sdf(ligand_mol2_path, crystal_sdf)

    smiles = ligand_pdb_to_smiles(ligand_mol2_path)  # generic despite the name - obabel auto-detects .mol2
    fresh_conformer_sdf = target_dir / "fresh_conformer.sdf"
    embed_fresh_conformer(smiles, identifier.replace(":", "_"), fresh_conformer_sdf)

    docking_result = _run_docking_single(
        sdf_path=fresh_conformer_sdf,
        receptor_path=receptor_path,
        ref_ligand_path=ligand_mol2_path,
        target_job_id=f"redocking_dataset_{identifier.replace(':', '_')}",
        docking_overrides=docking_overrides,
    )
    if not docking_result.get("success") or not docking_result.get("results"):
        raise RuntimeError(docking_result.get("error", "Docking produced no results"))

    result = docking_result["results"][0]
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Docking failed for this ligand"))

    docked_pose_path = Path(result["output_file"])
    pose_rmsds = compute_rmsd_multi(docked_pose_path, crystal_sdf, smiles, top_n=5)
    rmsd = pose_rmsds[0]
    valid_top5 = [r for r in pose_rmsds[:5] if r is not None]
    rmsd_sr5 = min(valid_top5) if valid_top5 else None

    return {
        "ligand_resname": None,
        "rmsd": rmsd,
        "success": rmsd is not None and rmsd <= rmsd_threshold,
        "rmsd_sr5": rmsd_sr5,
        "success_sr5": rmsd_sr5 is not None and rmsd_sr5 <= rmsd_threshold,
        "best_affinity": result.get("best_affinity"),
        "cnn_affinity": result.get("cnn_affinity") or result.get("cnn_score"),
        "processing_time_sec": result.get("processing_time"),
        "docked_pose_path": str(docked_pose_path),
        "crystal_ligand_path": str(crystal_sdf),
    }


# ---------------------------------------------------------------------------
# Run orchestration (Celery entry point) - same resume-safe pattern as
# benchmark_service.py's run_benchmark_sync
# ---------------------------------------------------------------------------

def build_run_config(
    pdb_ids: Optional[List[str]],
    rmsd_threshold: Optional[float],
    ligand_resnames: Optional[Dict[str, str]],
    docking_params: Optional[Dict[str, Any]],
    source: str = "rcsb",
    max_targets: Optional[int] = None,
) -> Dict[str, Any]:
    if source == "dataset":
        all_entries = list_dataset_redocking_targets()
        if not all_entries:
            raise ValueError(
                "No local dataset targets found under BENCHMARK_DATA_DIR - "
                "copy the dataset/ folder alongside the app first"
            )
        identifiers = [e["identifier"] for e in all_entries]
        if max_targets:
            identifiers = identifiers[:max_targets]
        return {
            "source": "dataset",
            "pdb_ids": identifiers,
            "rmsd_threshold": rmsd_threshold or DEFAULT_RMSD_THRESHOLD,
            "ligand_resnames": {},
            "docking_params": docking_params or {},
        }

    resolved = [p.strip().upper() for p in (pdb_ids or DEFAULT_PDB_IDS) if p.strip()]
    if not resolved:
        raise ValueError("At least one PDB id is required")
    return {
        "source": "rcsb",
        "pdb_ids": resolved,
        "rmsd_threshold": rmsd_threshold or DEFAULT_RMSD_THRESHOLD,
        "ligand_resnames": ligand_resnames or {},
        "docking_params": docking_params or {},
    }


def run_redocking_sync(run_id: str, progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
    with get_sync_database() as db:
        run = db.execute(select(RedockingRun).where(RedockingRun.id == run_id)).scalar_one_or_none()
        if not run:
            raise ValueError(f"Redocking run {run_id} not found")

        config = run.config or {}
        source = config.get("source", "rcsb")
        pdb_ids: List[str] = config.get("pdb_ids", DEFAULT_PDB_IDS)
        rmsd_threshold = config.get("rmsd_threshold", DEFAULT_RMSD_THRESHOLD)
        ligand_resnames = config.get("ligand_resnames", {})
        docking_overrides = config.get("docking_params", {})

        existing_rows = db.execute(
            select(RedockingTargetResult).where(RedockingTargetResult.run_id == run_id)
        ).scalars().all()
        already_completed = set()
        completed = 0
        for row in existing_rows:
            if row.status == RedockingStatus.COMPLETED:
                already_completed.add(row.pdb_id)
                completed += 1
            elif row.status == RedockingStatus.RUNNING:
                row.status = RedockingStatus.FAILED
                row.error_message = "Orphaned: worker did not report back (likely crashed or was killed)"
                row.completed_at = datetime.utcnow()

        run.status = RedockingStatus.RUNNING
        if not run.started_at:
            run.started_at = datetime.utcnow()
        run.last_heartbeat = datetime.utcnow()
        run.total_targets = len(pdb_ids)
        run.completed_targets = completed
        db.commit()

    run_dir = Path(settings.RESULTS_DIR) / "redocking" / str(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    total = len(pdb_ids) or 1
    failed = 0
    remaining = [p for p in pdb_ids if p not in already_completed]

    # Dataset-source runs resolve (receptor, ligand) paths once up front by
    # identifier, rather than re-downloading anything per target.
    dataset_lookup: Dict[str, Dict[str, Any]] = {}
    if source == "dataset":
        dataset_lookup = {e["identifier"]: e for e in list_dataset_redocking_targets()}

    for pdb_id in remaining:
        with get_sync_database() as db:
            target_row = RedockingTargetResult(
                run_id=run_id, pdb_id=pdb_id, status=RedockingStatus.RUNNING,
                started_at=datetime.utcnow(),
            )
            db.add(target_row)
            db.commit()
            db.refresh(target_row)
            target_row_id = target_row.id

        try:
            if source == "dataset":
                entry = dataset_lookup.get(pdb_id)
                if entry is None:
                    raise RuntimeError(f"Dataset target '{pdb_id}' no longer found under BENCHMARK_DATA_DIR")
                summary = run_single_dataset_redocking_target(
                    identifier=pdb_id,
                    receptor_path=entry["receptor_path"],
                    ligand_mol2_path=entry["ligand_path"],
                    rmsd_threshold=rmsd_threshold,
                    docking_overrides=docking_overrides,
                    run_dir=run_dir,
                )
            else:
                summary = run_single_redocking_target(
                    run_id=str(run_id),
                    pdb_id=pdb_id,
                    ligand_resname_override=ligand_resnames.get(pdb_id),
                    rmsd_threshold=rmsd_threshold,
                    docking_overrides=docking_overrides,
                    run_dir=run_dir,
                )
            with get_sync_database() as db:
                row = db.execute(
                    select(RedockingTargetResult).where(RedockingTargetResult.id == target_row_id)
                ).scalar_one()
                row.status = RedockingStatus.COMPLETED
                row.ligand_resname = summary["ligand_resname"]
                row.rmsd = summary["rmsd"]
                row.success = summary["success"]
                row.rmsd_sr5 = summary["rmsd_sr5"]
                row.success_sr5 = summary["success_sr5"]
                row.best_affinity = summary["best_affinity"]
                row.cnn_affinity = summary["cnn_affinity"]
                row.processing_time_sec = summary["processing_time_sec"]
                row.docked_pose_path = summary["docked_pose_path"]
                row.crystal_ligand_path = summary["crystal_ligand_path"]
                row.completed_at = datetime.utcnow()
                db.commit()
            completed += 1

        except Exception as e:
            logger.error("Redocking target %s failed: %s", pdb_id, e, exc_info=True)
            with get_sync_database() as db:
                row = db.execute(
                    select(RedockingTargetResult).where(RedockingTargetResult.id == target_row_id)
                ).scalar_one()
                row.status = RedockingStatus.FAILED
                row.error_message = str(e)
                row.completed_at = datetime.utcnow()
                db.commit()
            failed += 1

        with get_sync_database() as db:
            run_row = db.execute(select(RedockingRun).where(RedockingRun.id == run_id)).scalar_one()
            run_row.completed_targets = completed
            run_row.failed_targets = failed
            run_row.last_heartbeat = datetime.utcnow()
            db.commit()

        if progress_callback:
            progress_callback({
                "completed": completed + failed, "total": total,
                "percentage": (completed + failed) / total * 100,
                "status": f"Finished {pdb_id}",
            })

    with get_sync_database() as db:
        run_row = db.execute(select(RedockingRun).where(RedockingRun.id == run_id)).scalar_one()
        run_row.status = RedockingStatus.COMPLETED if completed > 0 else RedockingStatus.FAILED
        run_row.completed_at = datetime.utcnow()
        run_row.last_heartbeat = datetime.utcnow()
        db.commit()

    return {"success": True, "run_id": str(run_id), "completed": completed, "failed": failed}
