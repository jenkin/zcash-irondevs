"""Entry point: mine -> dedup -> time-sliced snapshots -> temporal analysis -> export."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import click
from tqdm import tqdm

from . import temporal_paths
from .discover import discover_repos
from .export import build_archive, write_json
from .graph import build_snapshot, resolve_contributions
from .identity import IdentityResolver
from .milestones import MILESTONES
from .mine import mine_all
from .temporal import build_timeline_events


@click.command()
@click.option("--data-dir", default="../../data", show_default=True, help="Root of data/<org>/<repo>.git")
@click.option("--cache-dir", default=".cache", show_default=True, help="Incremental per-repo mining cache")
@click.option("--out", default="web/public/graph.json", show_default=True, help="Output archive JSON")
@click.option("--workers", default=4, show_default=True, help="Repos mined in parallel (one process each)")
@click.option("--force", is_flag=True, help="Ignore the cache and re-mine every repo from scratch")
@click.option(
    "--causal/--no-causal",
    default=False,
    help=(
        "Attempt the optional PathpyG causal-betweenness layer (skipped automatically if not "
        "installed). Opt-in and off by default: measured to use ~7.5GB RAM on a graph of only "
        "278 nodes / ~19k temporal edges, and an out-of-memory kill happens at the OS level, "
        "bypassing this process's own error handling -- on the full archive it could take down "
        "the entire run, not just this optional extra. See temporal_paths.py."
    ),
)
def main(data_dir: str, cache_dir: str, out: str, workers: int, force: bool, causal: bool) -> None:
    data_path = Path(data_dir)
    cache_path = Path(cache_dir)

    repos = discover_repos(data_path)
    if not repos:
        click.echo(f"No repos found under {data_path.resolve()}", err=True)
        sys.exit(1)
    click.echo(f"Found {len(repos)} repos under {data_path}")

    results, commits = mine_all(repos, cache_path, workers=workers, force=force)
    mined = sum(1 for r in results if r.ok and not r.skipped)
    skipped = sum(1 for r in results if r.ok and r.skipped)
    failed = [r for r in results if not r.ok]
    click.echo(f"Mined {mined} repos, {skipped} unchanged since last run, {len(failed)} failed")
    for r in failed:
        click.echo(f"  FAILED {r.repo}: {(r.error or '').splitlines()[0]}", err=True)
    click.echo(f"{len(commits)} total commits across {len(repos)} repos")

    resolver = IdentityResolver()
    contributions = resolve_contributions(commits, resolver)
    identities = resolver.resolve()
    click.echo(f"{len(identities)} deduplicated authors ({sum(i.is_bot for i in identities.values())} bots tagged)")

    now = datetime.now(timezone.utc)
    checkpoints = [m for m in MILESTONES if m["date"] <= now] or MILESTONES[:1]
    future = [m for m in MILESTONES if m["date"] > now]
    if checkpoints[-1]["date"] < now:
        checkpoints = [*checkpoints, {"name": "Now", "date": now}]
    # The next upgrade gets its own point on the timeline too, placed at its
    # real activation date, rather than staying invisible until it happens.
    # Its snapshot is identical to "Now" (cumulative slicing at a future date
    # picks up the same commits as slicing at the present, since none exist
    # yet for an upgrade that hasn't activated) -- that's the honest state:
    # a real future point on the calendar, holding the same data as today,
    # not a fabricated preview of what it'll look like once it does.
    if future:
        checkpoints = [*checkpoints, future[0]]

    snapshots = []
    window_snapshots = []
    for cp in tqdm(checkpoints, desc="Building snapshots"):
        snapshots.append(build_snapshot(contributions, identities, cp["date"], mode="cumulative"))
        window_snapshots.append(
            build_snapshot(contributions, identities, cp["date"], mode="window", window_days=548)
        )

    events = build_timeline_events(snapshots)
    click.echo(f"{len(events)} community formation/merge/split events detected")

    causal_centrality = None
    if causal:
        if temporal_paths.available():
            click.echo("Running optional PathpyG causal-betweenness layer...")
            try:
                causal_centrality = temporal_paths.analyze(contributions)
            except Exception as exc:  # noqa: BLE001 - optional layer must never sink the run
                click.echo(f"PathpyG layer failed at runtime, skipping (optional): {exc}", err=True)
        else:
            click.echo("PathpyG extra not installed or unusable in this environment, skipping causal-betweenness layer (optional)")

    archive = build_archive(
        snapshots=snapshots,
        window_snapshots=window_snapshots,
        events=events,
        identities=identities,
        milestones=checkpoints,
        causal_centrality=causal_centrality,
        meta={
            "generatedAt": now.isoformat(),
            "repoCount": len(repos),
            "commitCount": len(commits),
            "authorCount": len(identities),
            "failedRepos": [r.repo for r in failed],
        },
    )
    write_json(Path(out), archive)
    click.echo(f"Wrote {out}")


if __name__ == "__main__":
    main()
