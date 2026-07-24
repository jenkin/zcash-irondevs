"""Per-repo incremental mining cache.

Each repo gets a JSON sidecar recording the HEAD commit hash we last mined
and the commit records extracted so far. On the next run, if HEAD hasn't
moved, the repo is skipped entirely; if it has, only commits *newer* than
the cached point are re-walked (PyDriller supports this natively via a
`since`-less resume on hash) and the new records are appended.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import orjson


class RepoCache:
    def __init__(self, cache_dir: Path, repo_slug: str) -> None:
        self.path = cache_dir / f"{repo_slug.replace('/', '__')}.json"
        self._data: dict[str, Any] | None = None

    def load(self) -> dict[str, Any]:
        if self._data is None:
            if self.path.exists():
                try:
                    self._data = orjson.loads(self.path.read_bytes())
                except orjson.JSONDecodeError:
                    # The cache is a disposable optimization over the real
                    # source of truth (the bare repo itself), never the other
                    # way round -- a truncated/corrupt sidecar (crash or kill
                    # mid-write, disk full, partial copy) must self-heal into
                    # a full re-mine of that one repo, not silently erase its
                    # commit history from the archive.
                    self._data = {"head": None, "commits": []}
            else:
                self._data = {"head": None, "commits": []}
        return self._data

    def save(self, head: str, commits: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write: a crash or kill mid-write must never leave a
        # half-written file behind for the next run to trip over -- os.replace
        # is atomic on both POSIX and Windows (same filesystem, which a
        # same-directory temp file guarantees).
        tmp_path = self.path.with_suffix(".json.tmp")
        tmp_path.write_bytes(orjson.dumps({"head": head, "commits": commits}))
        os.replace(tmp_path, self.path)

    def cached_head(self) -> str | None:
        return self.load().get("head")

    def cached_commits(self) -> list[dict[str, Any]]:
        return self.load().get("commits", [])


def repo_head(bare_repo_path: Path) -> str | None:
    """Read HEAD's resolved commit hash directly from the bare repo, no clone needed."""
    try:
        out = subprocess.run(
            ["git", "--git-dir", str(bare_repo_path), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        return out.stdout.strip() or None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return None
