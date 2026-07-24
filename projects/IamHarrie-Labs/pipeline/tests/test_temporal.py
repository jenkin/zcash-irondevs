"""Community-event classification (formed/continued/merged/split/dissolved)
is the narrative engine behind every "Chapters" callout in the app -- these
tests pin down the Jaccard-overlap rules so a refactor can't quietly change
what counts as a "merge" versus a "split" without a test noticing.
"""

from __future__ import annotations

from pipeline.temporal import diff_communities


def _snapshot(as_of: str, node_communities: dict[str, int]) -> dict:
    return {
        "asOf": as_of,
        "nodes": [{"id": node_id, "community": cid} for node_id, cid in node_communities.items()],
    }


def test_formed_when_no_prior_community_overlaps():
    prev = _snapshot("t0", {"a": 0, "b": 0})
    curr = _snapshot("t1", {"a": 0, "b": 0, "c": 1, "d": 1})
    events = diff_communities(prev, curr)
    formed = [e for e in events if e.kind == "formed"]
    assert any(e.to_communities == [1] for e in formed)


def test_continued_when_exactly_one_prior_community_overlaps():
    prev = _snapshot("t0", {"a": 0, "b": 0, "c": 0})
    curr = _snapshot("t1", {"a": 0, "b": 0, "c": 0, "d": 0})
    events = diff_communities(prev, curr)
    assert any(e.kind == "continued" and e.from_communities == [0] for e in events)


def test_merged_when_two_prior_communities_feed_one_current():
    prev = _snapshot("t0", {"a": 0, "b": 0, "c": 1, "d": 1})
    curr = _snapshot("t1", {"a": 2, "b": 2, "c": 2, "d": 2})
    events = diff_communities(prev, curr)
    merged = [e for e in events if e.kind == "merged"]
    assert len(merged) == 1
    assert set(merged[0].from_communities) == {0, 1}


def test_split_when_one_prior_community_feeds_two_current():
    prev = _snapshot("t0", {"a": 0, "b": 0, "c": 0, "d": 0})
    curr = _snapshot("t1", {"a": 1, "b": 1, "c": 2, "d": 2})
    events = diff_communities(prev, curr)
    split = [e for e in events if e.kind == "split"]
    assert len(split) == 1
    assert split[0].from_communities == [0]
    assert set(split[0].to_communities) == {1, 2}


def test_dissolved_when_a_prior_community_has_no_survivors():
    prev = _snapshot("t0", {"a": 0, "b": 0})
    curr = _snapshot("t1", {})
    events = diff_communities(prev, curr)
    assert any(e.kind == "dissolved" and e.from_communities == [0] for e in events)


def test_isolated_nodes_with_negative_community_are_ignored():
    prev = _snapshot("t0", {"a": -1})
    curr = _snapshot("t1", {"a": -1})
    assert diff_communities(prev, curr) == []
