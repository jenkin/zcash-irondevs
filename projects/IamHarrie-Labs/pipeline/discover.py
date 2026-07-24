"""Find bare git repositories under a CodeZ-style data/<org>/<repo>.git tree."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RepoRef:
    org: str
    name: str
    path: Path

    @property
    def slug(self) -> str:
        return f"{self.org}/{self.name}"


def discover_repos(data_dir: Path) -> list[RepoRef]:
    """Walk data_dir/<org>/<repo>.git and return every bare repo found.

    Anything that isn't a directory ending in .git, or that fails the bare-repo
    sanity check (a HEAD file), is skipped rather than aborting the run -- the
    full archive is expected to contain wikis, forks and other noise.
    """
    repos: list[RepoRef] = []
    if not data_dir.is_dir():
        return repos

    for org_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        for repo_dir in sorted(org_dir.glob("*.git")):
            if not repo_dir.is_dir() or not (repo_dir / "HEAD").exists():
                continue
            repos.append(
                RepoRef(org=org_dir.name, name=repo_dir.name[: -len(".git")], path=repo_dir)
            )
    return repos
