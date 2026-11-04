"""Commit-metadata mining from bare repositories.

We only need commit *metadata* (author, committer, co-authors, date), never
diffs, so mining is fast and safe to run against the judge's bare mirrors.

Two features live here:
    * multiprocessing, one worker process per repository (extra feature)
    * incremental, per-repo cache keyed by HEAD; unchanged repos are
                         skipped, changed repos only append unseen commits
"""

from __future__ import annotations

import json
import subprocess
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path

from pydriller import Repository


@dataclass
class CommitRecord:
    repo: str
    hash: str
    author_name: str
    author_email: str
    committer_name: str
    committer_email: str
    date: str  # ISO 8601, authoring time
    co_authors: list[tuple[str, str]] = field(default_factory=list)


def repo_slug(repo_path: Path, data_root: Path) -> str:
    """`data/ZcashFoundation/zebra.git` -> `ZcashFoundation/zebra`."""
    rel = repo_path.relative_to(data_root)
    return str(rel).removesuffix(".git")


def discover_repos(data_root: Path) -> list[Path]:
    return sorted(p for p in data_root.glob("*/*.git") if p.is_dir())


def _head_sha(repo_path: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "--git-dir", str(repo_path), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def _pick_date(commit) -> str:
    dt = commit.author_date or commit.committer_date
    return dt.astimezone(tz=dt.tzinfo).isoformat()


def _clean(s: str | None) -> str:
    """Strip lone surrogates / undecodable bytes from git metadata so neither the
    JSON cache write nor the downstream graph export can crash on one weird name."""
    return (s or "").encode("utf-8", "replace").decode("utf-8").strip()


def mine_repo(repo_path: str, slug: str, seen_hashes: set[str] | None = None) -> list[dict]:
    """Mine one repo. Returns new commit records not in ``seen_hashes``.

    Fault-isolated: a repo that fails mid-traversal (empty/unborn HEAD, corrupt
    ref, unreadable object) returns whatever it collected instead of raising, so a single bad repo among hundreds can't abort the whole archive run.
    """
    seen = seen_hashes or set()
    records: list[dict] = []
    try:
        for c in Repository(repo_path).traverse_commits():
            if c.hash in seen:
                continue
            records.append(
                asdict(
                    CommitRecord(
                        repo=slug,
                        hash=c.hash,
                        author_name=_clean(c.author.name),
                        author_email=_clean(c.author.email),
                        committer_name=_clean(c.committer.name),
                        committer_email=_clean(c.committer.email),
                        date=_pick_date(c),
                        co_authors=[(_clean(d.name), _clean(d.email)) for d in c.co_authors],
                    )
                )
            )
    except Exception as e:  # noqa: BLE001, resilience beats correctness-of-one-repo here
        print(f"  ! {slug}: mining stopped early ({type(e).__name__}); kept {len(records)}")
    return records


def mine_all(
    data_root: Path,
    cache_dir: Path | None = None,
    workers: int | None = None,
) -> list[dict]:
    """Mine every repo under ``data_root`` in parallel, using an incremental cache."""
    repos = discover_repos(data_root)
    if not repos:
        raise SystemExit(f"No bare repos found under {data_root} (run init.sh first).")

    cache_dir = cache_dir or (data_root.parent / ".cache" / "mine")
    cache_dir.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[str, str, set[str], Path, str]] = []
    reused: list[dict] = []
    for repo in repos:
        slug = repo_slug(repo, data_root)
        head = _head_sha(repo)
        cache_file = cache_dir / f"{slug.replace('/', '__')}.json"
        cached = _load_cache(cache_file)
        if cached and cached.get("head") == head:
            reused.extend(cached["records"])
            print(f"  · {slug}: cache hit ({len(cached['records'])} commits)")
            continue
        seen = {r["hash"] for r in cached["records"]} if cached else set()
        jobs.append((str(repo), slug, seen, cache_file, head))

    mined: list[dict] = list(reused)
    if jobs:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futs = {
                pool.submit(mine_repo, path, slug, seen): (slug, cache_file, head, seen)
                for path, slug, seen, cache_file, head in jobs
            }
            for fut in as_completed(futs):
                slug, cache_file, head, seen = futs[fut]
                try:
                    new_records = fut.result()
                except Exception as e:  # noqa: BLE001, one worker dying must not abort the run
                    print(f"  ! {slug}: skipped ({type(e).__name__})")
                    continue
                prior = _load_cache(cache_file)
                all_records = (prior["records"] if prior else []) + new_records
                _save_cache(cache_file, head, all_records)
                mined.extend(all_records)
                tag = "incremental" if seen else "full"
                print(f"  · {slug}: +{len(new_records)} new commits ({tag})")

    return mined


def _load_cache(path: Path) -> dict | None:
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_cache(path: Path, head: str, records: list[dict]) -> None:
    path.write_text(json.dumps({"head": head, "records": records}))
