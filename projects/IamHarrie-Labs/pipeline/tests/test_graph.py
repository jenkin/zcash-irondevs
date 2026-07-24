"""Covers the pure graph-math functions: recency decay, the weakest-link
co-authorship projection, the render-time edge trim (a regression that
already shipped once this project's history -- see graph.py's
_trim_edges_for_render docstring), and the bus-factor articulation points.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import networkx as nx

from pipeline.graph import (
    Contribution,
    _trim_edges_for_render,
    build_bipartite,
    compute_bridges,
    project_coauthorship,
)


def _ts(days_ago: float, now: datetime) -> datetime:
    return now - timedelta(days=days_ago)


def test_build_bipartite_cumulative_decays_older_contributions():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    contributions = [
        Contribution("alice", "repo", _ts(0, now), "author"),
        Contribution("bob", "repo", _ts(365, now), "author"),  # one half-life old
    ]
    weights = build_bipartite(contributions, now)
    assert weights[("alice", "repo")] == 1.0
    assert 0.45 < weights[("bob", "repo")] < 0.55


def test_build_bipartite_excludes_contributions_after_as_of():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    contributions = [Contribution("alice", "repo", now + timedelta(days=1), "author")]
    weights = build_bipartite(contributions, now)
    assert weights == {}


def test_build_bipartite_window_mode_excludes_outside_window_no_decay():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    contributions = [
        Contribution("alice", "repo", _ts(10, now), "author"),
        Contribution("bob", "repo", _ts(1000, now), "author"),
    ]
    weights = build_bipartite(contributions, now, window_days=90)
    assert ("alice", "repo") in weights
    assert ("bob", "repo") not in weights
    # No decay applied inside the window -- full author weight.
    assert weights[("alice", "repo")] == 1.0


def test_project_coauthorship_uses_weakest_link_per_shared_repo():
    # Alice contributed 1.0 to repo, Bob only 0.3 -- their tie is bounded by
    # Bob's smaller share, not Alice's larger one.
    bipartite = {("alice", "repo"): 1.0, ("bob", "repo"): 0.3}
    g = project_coauthorship(bipartite)
    assert g["alice"]["bob"]["weight"] == 0.3


def test_project_coauthorship_sums_ties_across_multiple_shared_repos():
    bipartite = {
        ("alice", "repo-a"): 1.0,
        ("bob", "repo-a"): 1.0,
        ("alice", "repo-b"): 0.5,
        ("bob", "repo-b"): 0.5,
    }
    g = project_coauthorship(bipartite)
    assert g["alice"]["bob"]["weight"] == 1.5


def test_project_coauthorship_no_edge_without_a_shared_repo():
    bipartite = {("alice", "repo-a"): 1.0, ("bob", "repo-b"): 1.0}
    g = project_coauthorship(bipartite)
    assert not g.has_edge("alice", "bob")


def test_trim_edges_keeps_each_nodes_own_strongest_ties():
    # "hub" has far more ties than MAX_RENDERED_EDGES_PER_NODE (8), but every
    # leaf's *only* edge is also that leaf's own top tie -- so all 20 survive
    # for the leaves' sake, even though none of the low-weight ones would
    # make hub's own top-8. That asymmetry (a node can end up with more
    # edges than its own cap if it's a popular neighbor) is expected: the
    # cap bounds each node's own choices, not its total exposure.
    edges = [{"source": "hub", "target": f"leaf{i}", "weight": i} for i in range(20)]
    trimmed = _trim_edges_for_render(edges)
    leaves_present = {e["target"] for e in trimmed}
    assert leaves_present == {f"leaf{i}" for i in range(20)}


def test_trim_edges_caps_a_nodes_own_choices_when_peers_dont_need_the_edge():
    # Give every peer other, much stronger ties so its edge to "center" never
    # lands in the peer's own top-8 -- isolating the assertion to "center"'s
    # own cap, rather than the union with what its peers would keep anyway.
    edges = [{"source": "center", "target": f"peer{i}", "weight": i} for i in range(10)]
    for i in range(10):
        for j in range(8):
            edges.append({"source": f"peer{i}", "target": f"filler{i}_{j}", "weight": 1000})

    trimmed = _trim_edges_for_render(edges)
    center_edges = [e for e in trimmed if e["source"] == "center" or e["target"] == "center"]
    kept_weights = sorted(e["weight"] for e in center_edges)
    assert kept_weights == [2, 3, 4, 5, 6, 7, 8, 9]


def test_compute_bridges_flags_the_connector_in_a_barbell_graph():
    # Two triangles joined by a single shared node: that node is the only
    # articulation point -- removing it splits the graph into two pieces.
    g = nx.Graph()
    g.add_edges_from([("a1", "a2"), ("a2", "a3"), ("a3", "a1")], weight=1.0)
    g.add_edges_from([("b1", "b2"), ("b2", "b3"), ("b3", "b1")], weight=1.0)
    g.add_edge("a1", "bridge", weight=1.0)
    g.add_edge("bridge", "b1", weight=1.0)

    bridges = compute_bridges(g)
    assert "bridge" in bridges
    assert "a2" not in bridges
    assert "b2" not in bridges


def test_compute_bridges_empty_for_a_fully_connected_triangle():
    g = nx.Graph()
    g.add_edges_from([("a", "b"), ("b", "c"), ("c", "a")], weight=1.0)
    assert compute_bridges(g) == set()


def test_compute_bridges_ignores_components_smaller_than_three():
    g = nx.Graph()
    g.add_edge("a", "b", weight=1.0)
    assert compute_bridges(g) == set()
