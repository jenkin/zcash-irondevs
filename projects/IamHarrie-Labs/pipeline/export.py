"""Serialize pipeline outputs to the JSON the frontend consumes."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

import orjson

from .temporal import CommunityEvent


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(orjson.dumps(data, option=orjson.OPT_INDENT_2))


def build_archive(
    snapshots: list[dict[str, Any]],
    events: list[CommunityEvent],
    identities: dict[str, Any],
    milestones: list[dict[str, Any]],
    causal_centrality: dict[str, Any] | None,
    meta: dict[str, Any],
    window_snapshots: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "meta": meta,
        "milestones": [{"name": m["name"], "date": m["date"].isoformat()} for m in milestones],
        "identities": {
            author_id: {
                "name": ident.display_name,
                "isBot": ident.is_bot,
                "commitCount": ident.commit_count,
                "aliasCount": max(len(ident.emails), 1, len(ident.aliases)),
                "githubLogin": ident.github_login,
            }
            for author_id, ident in identities.items()
        },
        "snapshots": snapshots,
        "windowSnapshots": window_snapshots or [],
        "communityEvents": [asdict(e) for e in events],
        "causalCentrality": causal_centrality,
    }
