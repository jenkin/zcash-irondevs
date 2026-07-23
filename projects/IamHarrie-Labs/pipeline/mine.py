"""Commit mining: one process per repo, metadata only (no diffs), incremental.

Reading only commit metadata (hash, author/committer identity, date, message)
keeps this safe and fast against bare mirrors: PyDriller never has to touch
blob content, so a huge or malformed repo can't blow up memory walking diffs
we don't need.
"""

from __future__ import annotations

import re
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from pydriller import Repository

from .cache import RepoCache, repo_head
from .discover import RepoRef
from .repo_config import HISTORY_FLOOR

_COAUTHOR_RE = re.compile(
    r"^\s*co-authored-by:\s*(?P<name>[^<]+?)\s*<(?P<email>[^>]+)>\s*$",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass(frozen=True)
class CommitRecord:
    repo: str
    hash: str
    date: str  # ISO 8601
    author_name: str
    author_email: str
    committer_name: str
    committer_email: str
    co_authors: list[tuple[str, str]]


@dataclass
class MineResult:
    repo: str
    ok: bool
    skipped: bool
    commit_count: int
    error: str | None = None


def _parse_coauthors(message: str) -> list[tuple[str, str]]:
    return [(m.group("name").strip(), m.group("email").strip()) for m in _COAUTHOR_RE.finditer(message)]


def mine_repo(ref: RepoRef, cache_dir: Path, force: bool = False) -> tuple[MineResult, list[dict[str, Any]]]:
    """Mine one repo, resuming from its cache. Never raises -- failures are reported, not fatal."""
    cache = RepoCache(cache_dir, ref.slug)
    try:
        current_head = repo_head(ref.path)
        cached_head = None if force else cache.cached_head()

        if current_head is not None and current_head == cached_head:
            cached = cache.cached_commits()
            return MineResult(ref.slug, ok=True, skipped=True, commit_count=len(cached)), cached

        existing = {} if force else {c["hash"]: c for c in cache.cached_commits()}

        kwargs: dict[str, Any] = {"only_no_merge": False}
        if cached_head and not force:
            kwargs["from_commit"] = cached_head

        floor = HISTORY_FLOOR.get(ref.slug)

        new_records: dict[str, dict[str, Any]] = {}
        for commit in Repository(str(ref.path), **kwargs).traverse_commits():
            if commit.hash in existing:
                continue
            if floor is not None and commit.committer_date < floor:
                continue
            record = CommitRecord(
                repo=ref.slug,
                hash=commit.hash,
                date=commit.committer_date.isoformat(),
                author_name=commit.author.name or "",
                author_email=commit.author.email or "",
                committer_name=commit.committer.name or "",
                committer_email=commit.committer.email or "",
                co_authors=_parse_coauthors(commit.msg),
            )
            new_records[commit.hash] = asdict(record)

        merged = {**existing, **new_records}
        commits = list(merged.values())
        cache.save(current_head or "", commits)
        return MineResult(ref.slug, ok=True, skipped=False, commit_count=len(commits)), commits

    except Exception as exc:  # noqa: BLE001 - a bad repo must not abort the whole run
        return (
            MineResult(ref.slug, ok=False, skipped=False, commit_count=0, error=f"{exc}\n{traceback.format_exc(limit=2)}"),
            [],
        )


def mine_all(
    repos: list[RepoRef],
    cache_dir: Path,
    workers: int = 4,
    force: bool = False,
) -> tuple[list[MineResult], list[dict[str, Any]]]:
    results: list[MineResult] = []
    all_commits: list[dict[str, Any]] = []

    if workers <= 1:
        for ref in repos:
            result, commits = mine_repo(ref, cache_dir, force)
            results.append(result)
            all_commits.extend(commits)
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(mine_repo, ref, cache_dir, force): ref for ref in repos}
            for future in as_completed(futures):
                ref = futures[future]
                try:
                    result, commits = future.result()
                except Exception as exc:  # noqa: BLE001 - process crash must not abort the run
                    result, commits = MineResult(ref.slug, ok=False, skipped=False, commit_count=0, error=str(exc)), []
                results.append(result)
                all_commits.extend(commits)

    # as_completed() returns results in whatever order worker processes
    # finish, which varies run to run. Everything downstream (graph node/edge
    # insertion order, Louvain's result) is sensitive to input order, so pin
    # it here: one sort, deterministic regardless of worker scheduling.
    results.sort(key=lambda r: r.repo)
    all_commits.sort(key=lambda c: (c["repo"], c["hash"]))

    return results, all_commits
