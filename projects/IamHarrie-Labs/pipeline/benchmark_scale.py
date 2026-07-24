"""A synthetic stress test for build_snapshot at a scale bigger than the
real dev sample, since the full 536-repo contest archive was never
available to run this pipeline against directly (see the README's "Data
used for development" section). This can't tell you what the real archive
will do -- real collaboration graphs aren't random graphs, and this makes
no attempt to be one -- but it replaces a guess about scaling with an
actual measurement of the same code path on a graph several times bigger
than anything this project has actually run.

Run with: uv run python -m pipeline.benchmark_scale
"""

from __future__ import annotations

import random
import time
import tracemalloc
from datetime import datetime, timedelta, timezone

from .graph import Contribution, build_snapshot
from .identity import Identity

# Roughly 4x the real dev sample's people (608) and repos (12) at the
# final, heaviest checkpoint. Authors are grouped into teams that mostly
# work within a handful of shared repos, with a little cross-team overlap
# to create bridges between them -- a rough, deliberately simplified stand-in
# for how open-source contribution actually clusters, rather than a uniform
# random graph, which would be both unrealistic and needlessly dense.
N_AUTHORS = 2500
N_REPOS = 70
N_TEAMS = 10
REPOS_PER_TEAM = 3
CROSS_TEAM_AUTHOR_FRACTION = 0.05  # this slice also contributes to a second team's repos
N_CONTRIBUTIONS = 150_000

SPAN_DAYS = 365 * 10  # matches the real project's roughly ten-year window


def _synthetic_contributions(seed: int = 42) -> tuple[list[Contribution], dict[str, Identity]]:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)

    team_of_author: dict[int, int] = {}
    secondary_team_of_author: dict[int, int] = {}
    for i in range(N_AUTHORS):
        team_of_author[i] = i % N_TEAMS
        if rng.random() < CROSS_TEAM_AUTHOR_FRACTION:
            secondary_team_of_author[i] = (team_of_author[i] + 1) % N_TEAMS

    repos_of_team: dict[int, list[int]] = {}
    next_repo = 0
    for t in range(N_TEAMS):
        repos_of_team[t] = [next_repo + j for j in range(REPOS_PER_TEAM)]
        next_repo = (next_repo + REPOS_PER_TEAM) % N_REPOS

    authors_by_team: dict[int, list[int]] = {}
    for i, t in team_of_author.items():
        authors_by_team.setdefault(t, []).append(i)
    for t, secondary in secondary_team_of_author.items():
        authors_by_team.setdefault(secondary, []).append(t)

    contributions: list[Contribution] = []
    for _ in range(N_CONTRIBUTIONS):
        team = rng.randrange(N_TEAMS)
        pool = authors_by_team[team]
        # Zipf-like skew within a team: a few prolific members, a longer
        # tail of occasional ones, matching real open-source patterns
        # better than picking uniformly at random would.
        weights = [1.0 / (rank + 1) for rank in range(len(pool))]
        author = pool[rng.choices(range(len(pool)), weights=weights, k=1)[0]]
        repo = rng.choice(repos_of_team[team])
        age_days = rng.uniform(0, SPAN_DAYS)
        ts = now - timedelta(days=age_days)
        role = rng.choices(["author", "co_author", "committer"], weights=[0.7, 0.25, 0.05], k=1)[0]
        contributions.append(Contribution(f"a{author}", f"r{repo}", ts, role))

    identities = {f"a{i}": Identity(canonical_id=f"a{i}", display_name=f"Author {i}") for i in range(N_AUTHORS)}
    return contributions, identities


def main() -> None:
    contributions, identities = _synthetic_contributions()
    now = datetime.now(timezone.utc)

    print(f"Synthetic scale: {N_AUTHORS} authors, {N_REPOS} repos, {len(contributions)} contributions")
    print("Running build_snapshot on the full cumulative history (the heaviest real checkpoint's shape)...")

    tracemalloc.start()
    t0 = time.perf_counter()
    snapshot = build_snapshot(contributions, identities, now, mode="cumulative")
    elapsed = time.perf_counter() - t0
    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"Nodes: {len(snapshot['nodes'])}, edges (post-trim): {len(snapshot['edges'])}, edges (full): {snapshot['edgeCountFull']}")
    print(f"Wall time: {elapsed:.1f}s")
    print(f"Peak Python-level memory (tracemalloc, not full process RSS): {peak / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
