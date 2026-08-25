"""
Virtual screening enrichment metrics (AUROC, EF, BEDROC) for benchmark runs.

Thin wrapper around rdkit.ML.Scoring.Scoring, which already implements the
standard definitions used across the DUD-E / LIT-PCBA literature. RDKit is a
hard dependency of this project, so no new package is required.
"""

import logging
import statistics
from typing import Dict, List, Sequence, Tuple

from rdkit.ML.Scoring.Scoring import CalcAUC, CalcBEDROC, CalcEnrichment

logger = logging.getLogger(__name__)

# Standard BEDROC alpha (Truchon & Bayly, 2007) used throughout the field.
BEDROC_ALPHA = 80.5

# Enrichment fractions to report: EF1%, EF5%, EF10%.
EF_FRACTIONS = [0.01, 0.05, 0.10]


def compute_metrics(scored_labels: Sequence[Tuple[float, int]]) -> Dict[str, float]:
    """
    Compute AUROC, BEDROC(alpha=80.5) and EF1%/EF5%/EF10% for one target.

    Args:
        scored_labels: (score, label) pairs, one per docked compound, where
            label is 1 for a known active and 0 for a decoy/inactive, and a
            HIGHER score always means "ranked better" by the scoring function
            (callers must negate binding affinity, since more negative
            affinity is better; CNN scores are already higher-is-better).

    Returns:
        dict with auroc, bedroc, ef1, ef5, ef10 (all None if there are no
        actives or no decoys in the input, since the metrics are undefined).
    """
    labels = [label for _, label in scored_labels]
    n_actives = sum(1 for label in labels if label == 1)
    n_decoys = len(labels) - n_actives

    if n_actives == 0 or n_decoys == 0:
        logger.warning(
            "Cannot compute enrichment metrics with %d actives and %d decoys",
            n_actives, n_decoys,
        )
        return {"auroc": None, "bedroc": None, "ef1": None, "ef5": None, "ef10": None}

    # rdkit's Scoring functions require scores pre-sorted "best first".
    ordered = sorted(scored_labels, key=lambda pair: pair[0], reverse=True)
    rows = [[score, label] for score, label in ordered]

    auroc = CalcAUC(rows, 1)
    bedroc = CalcBEDROC(rows, 1, BEDROC_ALPHA)
    ef1, ef5, ef10 = CalcEnrichment(rows, 1, EF_FRACTIONS)

    return {
        "auroc": auroc,
        "bedroc": bedroc,
        "ef1": ef1,
        "ef5": ef5,
        "ef10": ef10,
        "n_actives": n_actives,
        "n_decoys": n_decoys,
    }


def aggregate_metrics(per_target_metrics: List[Dict[str, float]]) -> Dict[str, float]:
    """Mean/median of each metric across targets, ignoring targets where a metric is None."""
    aggregate: Dict[str, float] = {}
    for key in ("auroc", "bedroc", "ef1", "ef5", "ef10"):
        values = [m[key] for m in per_target_metrics if m.get(key) is not None]
        if values:
            aggregate[f"mean_{key}"] = statistics.mean(values)
            aggregate[f"median_{key}"] = statistics.median(values)
        else:
            aggregate[f"mean_{key}"] = None
            aggregate[f"median_{key}"] = None
    aggregate["n_targets"] = len(per_target_metrics)
    return aggregate
