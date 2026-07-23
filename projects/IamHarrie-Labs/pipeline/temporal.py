"""Temporal community analysis: how the graph's communities form, merge, and
dissolve across the decade -- the analytical wedge that sets this submission
apart from a single animated network. A snapshot's Louvain partition on its
own is just a coloring; comparing partitions *across* snapshots is what
turns it into a story about how the Zcash contributor base actually organized
itself around each protocol upgrade.

Community IDs are arbitrary per Louvain run, so events are detected by
member-set overlap (Jaccard) between consecutive snapshots, not by ID.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EventKind = Literal["formed", "dissolved", "merged", "split", "continued"]


@dataclass
class CommunityEvent:
    kind: EventKind
    at: str  # ISO timestamp of the later snapshot
    from_communities: list[int]
    to_communities: list[int]
    members: list[str]  # representative members driving the match


def _member_sets(snapshot: dict) -> dict[int, set[str]]:
    groups: dict[int, set[str]] = {}
    for node in snapshot["nodes"]:
        cid = node["community"]
        if cid < 0:
            continue
        groups.setdefault(cid, set()).add(node["id"])
    return groups


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / len(a | b) if inter else 0.0


def diff_communities(prev: dict, curr: dict, merge_threshold: float = 0.15) -> list[CommunityEvent]:
    prev_groups = _member_sets(prev)
    curr_groups = _member_sets(curr)
    events: list[CommunityEvent] = []

    # For each current community, find which previous communities fed into it.
    for cid, members in curr_groups.items():
        contributors = [
            (pid, _jaccard(members, pmembers))
            for pid, pmembers in prev_groups.items()
            if _jaccard(members, pmembers) >= merge_threshold
        ]
        contributors.sort(key=lambda x: -x[1])

        if not contributors:
            events.append(
                CommunityEvent("formed", curr["asOf"], [], [cid], sorted(members)[:5])
            )
        elif len(contributors) == 1:
            events.append(
                CommunityEvent("continued", curr["asOf"], [contributors[0][0]], [cid], sorted(members)[:5])
            )
        else:
            events.append(
                CommunityEvent(
                    "merged", curr["asOf"], [pid for pid, _ in contributors], [cid], sorted(members)[:5]
                )
            )

    # A previous community that doesn't feed strongly into exactly one current
    # community either split across several, or dissolved entirely.
    for pid, pmembers in prev_groups.items():
        matches = [cid for cid, members in curr_groups.items() if _jaccard(pmembers, members) >= merge_threshold]
        if len(matches) >= 2:
            events.append(
                CommunityEvent("split", curr["asOf"], [pid], matches, sorted(pmembers)[:5])
            )
        elif len(matches) == 0:
            events.append(
                CommunityEvent("dissolved", curr["asOf"], [pid], [], sorted(pmembers)[:5])
            )

    return events


def build_timeline_events(snapshots: list[dict]) -> list[CommunityEvent]:
    events: list[CommunityEvent] = []
    for prev, curr in zip(snapshots, snapshots[1:]):
        events.extend(diff_communities(prev, curr))
    return events
