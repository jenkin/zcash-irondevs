"""Optional extra: causal (time-respecting) betweenness via PathpyG.

Static betweenness (`graph.py`) answers "who bridges the most collaboration
pairs in a snapshot" -- but it's blind to causality: two people who never
overlapped can still count as "connected" through a repo one of them left
years before the other arrived. PathpyG's temporal betweenness instead only
counts paths that respect time order with a bounded hand-off window, so a
high score here means someone genuinely sat at a hand-off point in the
project's actual history -- e.g. the person whose work in `sapling-crypto`
was picked up by the `halo2` team within a few months, not just anyone who
ever touched both.

Requires torch + torch-geometric + pathpyG (the `temporal-advanced` extra,
GitHub-only -- see `pyproject.toml`). Imported lazily and fails soft: if the
extra isn't installed, `analyze()` returns None and the pipeline notes the
layer was skipped. Every required contest feature is satisfied without it.
"""

from __future__ import annotations

from typing import Any

from .graph import Contribution

HANDOFF_WINDOW_DAYS = 180.0

# Measured on our dev sample: 19,372 temporal edges (278 nodes) drove PathpyG's
# temporal_betweenness_centrality to ~7.5GB resident memory before the OS
# OOM-killer stepped in -- and a kill at that level bypasses this process's
# own error handling entirely, so a caller-side try/except can't save it. This
# cap is a conservative, empirically-grounded safety net, not a tuned
# threshold: we don't know PathpyG's actual scaling curve, so we stop well
# short of the one data point we have that's known to OOM a machine with
# 7.6GB available.
MAX_TEMPORAL_EDGES = 5_000


def available() -> bool:
    # Broad except is deliberate: torch's native extension can fail to *load*
    # (missing DLL/shared-lib dependency, ABI mismatch, no AVX2, etc.) even
    # when the package is installed, and that surfaces as OSError/RuntimeError,
    # not ImportError. Any failure here means "this extra isn't usable in this
    # environment" -- exactly the case this layer is meant to degrade out of.
    try:
        import pathpyG  # noqa: F401
        import torch  # noqa: F401
    except Exception:
        return False
    return True


def _edge_list(contributions: list[Contribution], epoch_days_zero: float) -> list[tuple[str, str, float]]:
    """One directed, time-stamped edge per consecutive pair of contributors on
    the same repo: earlier -> later, timestamped in days since the archive's
    first contribution (PathpyG's delta window is in the same units as time)."""
    by_repo: dict[str, list[Contribution]] = {}
    for c in contributions:
        by_repo.setdefault(c.repo, []).append(c)

    edges: list[tuple[str, str, float]] = []
    for repo_contributions in by_repo.values():
        ordered = sorted(repo_contributions, key=lambda c: c.timestamp)
        for i in range(len(ordered) - 1):
            a, b = ordered[i], ordered[i + 1]
            if a.author_id == b.author_id:
                continue
            t_days = b.timestamp.timestamp() / 86400.0 - epoch_days_zero
            edges.append((a.author_id, b.author_id, t_days))
    return edges


def analyze(
    contributions: list[Contribution],
    window_days: float = HANDOFF_WINDOW_DAYS,
    max_edges: int = MAX_TEMPORAL_EDGES,
) -> dict[str, Any] | None:
    """Fit a temporal graph over contributor hand-offs and return causal
    betweenness centrality per author, or None if the extra isn't installed
    or the input is large enough to risk an OS-level OOM kill (see
    `MAX_TEMPORAL_EDGES`)."""
    if not available():
        return None
    if not contributions:
        return {"windowDays": window_days, "centrality": {}}

    import pathpyG as pp

    epoch_days_zero = min(c.timestamp.timestamp() for c in contributions) / 86400.0
    edges = _edge_list(contributions, epoch_days_zero)
    if not edges:
        return {"windowDays": window_days, "centrality": {}}
    if len(edges) > max_edges:
        raise RuntimeError(
            f"{len(edges)} temporal edges exceeds the {max_edges}-edge safety cap "
            "(see MAX_TEMPORAL_EDGES) -- skipping rather than risking an OS-level "
            "OOM kill of the whole pipeline run"
        )

    t = pp.TemporalGraph.from_edge_list(edges)
    centrality = pp.algorithms.centrality.temporal_betweenness_centrality(t, delta=int(window_days))

    return {
        "windowDays": window_days,
        "centrality": {str(node): float(score) for node, score in centrality.items()},
    }
