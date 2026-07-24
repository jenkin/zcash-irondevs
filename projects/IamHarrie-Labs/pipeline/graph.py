"""Bipartite author<->repo graph, time-sliced projection, and network metrics.

Pipeline:
  1. Every commit contributes weighted (author, repo) edges: the author gets
     full weight, co-authors and the committer (when distinct) get partial
     weight, so a commit ghost-written by one person and landed by another
     doesn't count as two equal authorships.
  2. For a given point in time (cumulative "as of" or a sliding window), we
     sum those edges into a bipartite author<->repo graph, applying a
     recency decay so a slice doesn't just replay ancient history at full
     strength.
  3. We project that bipartite graph onto an author<->author co-authorship
     graph: two people are connected by the strength of their *weakest*
     shared involvement across every repo they both touched.
  4. Network metrics (degree, betweenness, Louvain communities, density) are
     computed on that projection.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Literal

import networkx as nx
from community import community_louvain

from .identity import Identity, IdentityResolver

ROLE_WEIGHT = {"author": 1.0, "co_author": 0.66, "committer": 0.33}
DECAY_HALF_LIFE_DAYS = 365.0  # within a slice, contributions lose half their weight per year of age


@dataclass(frozen=True)
class Contribution:
    author_id: str
    repo: str
    timestamp: datetime
    role: str


def _parse_ts(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _commit_sightings(commit: dict[str, Any]) -> list[tuple[str, str, str]]:
    """Every (name, email, role) sighting in one commit, author first."""
    sightings = [(commit["author_name"], commit["author_email"], "author")]
    sightings += [(name, email, "co_author") for name, email in commit.get("co_authors", [])]
    if commit["committer_email"] and commit["committer_email"] != commit["author_email"]:
        sightings.append((commit["committer_name"], commit["committer_email"], "committer"))
    return sightings


def resolve_contributions(
    commits: list[dict[str, Any]], resolver: IdentityResolver
) -> list[Contribution]:
    """Turn raw commit records into per-role weighted contributions, deduping
    identities as we go. Each commit contributes each *person* at most once,
    using their highest role (author > co-author > committer).

    Two passes are required, not one: `IdentityResolver` roots can shift as
    later commits reveal that two previously-separate aliases belong to the
    same person, so an id resolved mid-corpus would go stale by the time the
    whole archive is processed -- silently splitting one contributor into two
    graph nodes. Pass 1 registers every alias; pass 2 looks up final ids.
    """
    for commit in commits:
        for name, email, _role in _commit_sightings(commit):
            resolver.register(name, email)

    contributions: list[Contribution] = []
    for commit in commits:
        ts = _parse_ts(commit["date"])
        repo = commit["repo"]
        best_role: dict[str, str] = {}

        for name, email, role in _commit_sightings(commit):
            person_id = resolver.canonical(name, email)
            if role == "author":
                best_role[person_id] = "author"
            else:
                best_role.setdefault(person_id, role)

        for person_id, role in best_role.items():
            contributions.append(Contribution(person_id, repo, ts, role))

    return contributions


def _decay(age_days: float) -> float:
    if age_days <= 0:
        return 1.0
    return math.pow(0.5, age_days / DECAY_HALF_LIFE_DAYS)


def build_bipartite(
    contributions: Iterable[Contribution],
    as_of: datetime,
    window_days: float | None = None,
) -> dict[tuple[str, str], float]:
    """Sum contributions into author<->repo weights as of a point in time.

    window_days=None -> cumulative (everything up to as_of, recency-decayed).
    window_days=N -> sliding window of the last N days before as_of, no decay
    (the window itself already bounds recency).
    """
    weights: dict[tuple[str, str], float] = {}
    for c in contributions:
        if c.timestamp > as_of:
            continue
        age_days = (as_of - c.timestamp).total_seconds() / 86400.0
        if window_days is not None:
            if age_days > window_days:
                continue
            factor = 1.0
        else:
            factor = _decay(age_days)
        w = ROLE_WEIGHT[c.role] * factor
        key = (c.author_id, c.repo)
        weights[key] = weights.get(key, 0.0) + w
    return weights


def project_coauthorship(bipartite: dict[tuple[str, str], float]) -> nx.Graph:
    """Weakest-link projection: two authors' tie strength through a shared repo
    is bounded by whichever of them contributed less there; summed across every
    repo they share."""
    by_repo: dict[str, list[tuple[str, float]]] = {}
    for (author, repo), w in bipartite.items():
        by_repo.setdefault(repo, []).append((author, w))

    g = nx.Graph()
    # Sorted, not just deduplicated: a plain set's iteration order depends on
    # Python's per-process string hash randomization, which would make node
    # insertion order -- and therefore Louvain's result -- vary run to run.
    authors = sorted({a for a, _ in bipartite.keys()})
    for a in authors:
        g.add_node(a)

    for repo in sorted(by_repo):
        members = by_repo[repo]
        for i in range(len(members)):
            a_id, a_w = members[i]
            for j in range(i + 1, len(members)):
                b_id, b_w = members[j]
                tie = min(a_w, b_w)
                if tie <= 0:
                    continue
                if g.has_edge(a_id, b_id):
                    g[a_id][b_id]["weight"] += tie
                else:
                    g.add_edge(a_id, b_id, weight=tie)
    return g


@dataclass
class SnapshotMetrics:
    density: float
    degree: dict[str, float]
    betweenness: dict[str, float]
    communities: dict[str, int]
    bridges: set[str]


def compute_bridges(g: nx.Graph) -> set[str]:
    """The network's real "bus factor": people whose removal would split
    their own component into disconnected pieces (a graph articulation
    point), not a guess at anyone's importance. Computed per connected
    component rather than on the whole graph at once, since a co-authorship
    graph is rarely a single connected piece and networkx's algorithm
    assumes one. Components smaller than 3 people can't have a meaningful
    articulation point (removing either half of a pair just leaves one
    person, which isn't a "split")."""
    bridges: set[str] = set()
    for component in nx.connected_components(g):
        if len(component) < 3:
            continue
        bridges.update(nx.articulation_points(g.subgraph(component)))
    return bridges


def compute_metrics(g: nx.Graph, betweenness_sample: int | None = 200) -> SnapshotMetrics:
    density = nx.density(g) if g.number_of_nodes() > 1 else 0.0
    degree = dict(g.degree(weight="weight"))

    # Betweenness on large graphs is O(V*E); sample a subset of pivot nodes
    # for the full archive, exact for anything the size of our dev sample.
    k = betweenness_sample if g.number_of_nodes() > (betweenness_sample or 0) else None
    betweenness = nx.betweenness_centrality(g, weight="weight", k=k, seed=42) if g.number_of_nodes() > 2 else {}

    # random_state pinned: Louvain is stochastic, and an unseeded run would
    # reshuffle community ids (and the merge/split events derived from them)
    # on every re-run, which would make the timeline flicker for no reason.
    communities = (
        community_louvain.best_partition(g, weight="weight", random_state=42)
        if g.number_of_edges() > 0
        else {}
    )

    bridges = compute_bridges(g)

    return SnapshotMetrics(density=density, degree=degree, betweenness=betweenness, communities=communities, bridges=bridges)


def build_snapshot(
    contributions: list[Contribution],
    identities: dict[str, Identity],
    as_of: datetime,
    mode: Literal["cumulative", "window"] = "cumulative",
    window_days: float = 90.0,
) -> dict[str, Any]:
    bipartite = build_bipartite(contributions, as_of, window_days if mode == "window" else None)
    g = project_coauthorship(bipartite)
    metrics = compute_metrics(g)

    repos_by_author: dict[str, list[tuple[str, float]]] = {}
    for (author, repo), w in bipartite.items():
        repos_by_author.setdefault(author, []).append((repo, w))

    nodes = [
        {
            "id": node_id,
            "name": identities[node_id].display_name if node_id in identities else node_id,
            "isBot": identities[node_id].is_bot if node_id in identities else False,
            "degree": metrics.degree.get(node_id, 0.0),
            "betweenness": metrics.betweenness.get(node_id, 0.0),
            "community": metrics.communities.get(node_id, -1),
            "isBridge": node_id in metrics.bridges,
            "repos": [
                repo
                for repo, _w in sorted(
                    repos_by_author.get(node_id, []), key=lambda item: -item[1]
                )[:5]
            ],
        }
        for node_id in g.nodes
    ]
    edges = [
        {"source": u, "target": v, "weight": data["weight"]}
        for u, v, data in g.edges(data=True)
    ]
    edge_count_full = len(edges)
    edges = _trim_edges_for_render(edges)

    return {
        "asOf": as_of.isoformat(),
        "mode": mode,
        "density": metrics.density,
        "nodes": nodes,
        "edges": edges,
        "edgeCountFull": edge_count_full,
    }


MAX_RENDERED_EDGES_PER_NODE = 8


def _trim_edges_for_render(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Cap the *displayed* edges to each node's strongest few ties.

    Node metrics (degree, betweenness, community) are computed above on the
    full projected graph -- nothing about the analysis is thinned. This only
    prunes what actually gets drawn, because a well-connected contributor's
    real degree can be in the hundreds, and rendering every one of those
    edges turns the canvas into a solid mesh that hides the avatars sitting
    on top of it rather than showing who someone's closest collaborators
    are. Keeping a union of both endpoints' top ties (not a global top-N)
    means every node keeps its own strongest connections even if its
    neighbors are far more prolific.
    """
    by_node: dict[str, list[dict[str, Any]]] = {}
    for e in edges:
        by_node.setdefault(e["source"], []).append(e)
        by_node.setdefault(e["target"], []).append(e)
    keep: set[int] = set()
    for node_edges in by_node.values():
        node_edges.sort(key=lambda e: -e["weight"])
        for e in node_edges[:MAX_RENDERED_EDGES_PER_NODE]:
            keep.add(id(e))
    return [e for e in edges if id(e) in keep]
