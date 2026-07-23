from datetime import datetime, timedelta, timezone
from pathlib import Path
from pydriller import Repository
import numpy as np
import networkx as nx
from networkx.algorithms import bipartite
from networkx.algorithms.community import louvain_communities
import re
from time import perf_counter
from math import sqrt
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.image as mpimg
from fa2 import ForceAtlas2

plt.close("all")

# Role weights
ROLE_AUTHOR_WEIGHT = 1.0
ROLE_COAUTHOR_WEIGHT = 0.66
ROLE_COMMITTER_WEIGHT = 0.33

# Global constants
SEED = 42
NOW = datetime.now(timezone.utc)
START_DATE = datetime(2013, 6, 24, tzinfo=timezone.utc)  # Zerocoin paper
DECAY_RATE_PER_DAY = 0.001
EDGE_WIDTH_SCALE_FACTOR = 1.2
NODE_SIZE_SCALE_FACTOR = 0.5
OUTPUT_FILENAME = "zcash_irondevs_static.png"
GRID_HEIGHT = 5
GRID_WIDTH = 5

BOT_PATTERN = re.compile(  # Courtesy of Gemini
  r"("
  # Category A: Generic Automated keywords
  r"bot|actions?|automation|ci[-_]?cd|jenkins|travis|circleci|pipeline|runner|no[-_]?reply|github|"
  # Category B: Dependency & Security Tools
  r"dependabot|renovate|greenkeeper|snyk|sonar|whitesource|fossa|mend|"
  # Category C: Cloud Providers & Automated Hosting signatures
  r"\.github\.com|\.gitlab\.com|gcr\.io|vercel|netlify|heroku|"
  # Category D: Common Release & Formatting Tools
  r"semantic-release|prettier|eslint|black-formatting|husky|linter"
  r")",
  re.IGNORECASE,
)

# Initial graph
SG = nx.Graph()


def time_decay(
  source: datetime,
  target: datetime,
  now: datetime = datetime.now(timezone.utc),
  decay_rate: float = 0.01,
) -> float:
  """Computes exact exponential decay for any continuous point in time."""
  if target < source:
    raise ValueError("Target date cannot be before the start date.")

  if target > now:
    raise ValueError("Target date cannot be in the future beyond 'now'.")

  if target == source:
    return 0.0

  if target == now:
    return 1.0

  # Calculate continuous time deltas
  days_to_target = (target - source).total_seconds() / 86400.0
  days_to_now = (now - source).total_seconds() / 86400.0

  # Standard exponential growth bounded between 0 and 1
  raw_growth_target = 1.0 - np.exp(-decay_rate * days_to_target)
  raw_growth_now = 1.0 - np.exp(-decay_rate * days_to_now)

  # Compute continuous decay
  return raw_growth_target / raw_growth_now


def update_edge(u: str, v: str, weight: float) -> None:
  """Update or create an edge in the static graph."""
  s_edge = SG.get_edge_data(u, v)

  if s_edge is not None:
    # Update the existing live dictionary directly
    SG[u][v]["weight"] = s_edge.get("weight", 0) + weight
  else:
    # No interaction exists yet; create a new edge
    SG.add_edge(u, v, weight=weight)


def is_bot(name: str | None, email: str | None) -> bool:
  """Commits authored by bots (ie. renovate, github bot, ci/cd pipelines)"""
  return bool(BOT_PATTERN.search(name or "")) or bool(BOT_PATTERN.search(email or ""))


def get_projected_weight(G: nx.Graph, u: str, v: str):
  """Compute projected weights as sum of the weakest edges"""
  w = 0

  for nbr in set(G[u]) & set(G[v]):
    w += min(G[u][nbr].get("weight", 0), G[v][nbr].get("weight", 0))

  return w


def main():
  start_time = perf_counter()
  data = Path("../../data")

  commits = set()
  emails = set()
  repos = set()
  start = datetime.max.replace(tzinfo=timezone.utc)
  end = datetime.min.replace(tzinfo=timezone.utc)

  for commit in Repository(
    [str(repo) for repo in data.glob("./*/*.git") if repo.is_dir()]
  ).traverse_commits():
    # Skip merge commit
    if commit.merge:
      continue

    # Transform all date in UTC
    committer_date = commit.committer_date.replace(
      tzinfo=timezone(timedelta(seconds=commit.committer_timezone))
    )

    # Skip commits before Zerocoin paper
    if committer_date < START_DATE:
      continue

    # Skip duplicated hashes (from forks)
    if commit.hash in commits:
      continue

    # Count commits
    commits.add(commit.hash)

    # Save first and last commit dates
    start = committer_date if committer_date < start else start
    end = committer_date if committer_date > end else end

    # Track people mail addresses
    emails.add(commit.author.email)
    emails.update([co_author.email for co_author in commit.co_authors])
    emails.add(commit.committer.email)

    # Track repositories
    repos.add(commit.project_name)

    # Compute commit <-> repository edge weight
    commit_weight = time_decay(START_DATE, committer_date, NOW, DECAY_RATE_PER_DAY)

    # Create or update an author <-> repository edge
    # Ignore author without email and bots
    if commit.author.email and not is_bot(
      commit.author.name or "", commit.author.email
    ):
      update_edge(
        f"dev:{commit.author.email}",
        f"repo:{commit.project_name}",
        ROLE_AUTHOR_WEIGHT * commit_weight,
      )

    # Create or update the co-author <-> repository edges
    for co_author in commit.co_authors:
      # Ignore co-author without email
      if not co_author.email:
        continue

      # Ignore co-author that is also the primary author
      if co_author.email == commit.author.email:
        continue

      # Ignore bots
      if is_bot(co_author.name, co_author.email):
        continue

      update_edge(
        f"dev:{co_author.email}",
        f"repo:{commit.project_name}",
        ROLE_COAUTHOR_WEIGHT * commit_weight,
      )

    # Create or update the committeer <-> repository edge
    # Ignore committer that is also the primary author or a co-author and bots
    if (
      commit.committer.email
      and commit.committer.email != commit.author.email
      and commit.committer.email
      not in [co_author.email for co_author in commit.co_authors]
      and not is_bot(commit.committer.name, commit.committer.email)
    ):
      update_edge(
        f"dev:{commit.committer.email}",
        f"repo:{commit.project_name}",
        ROLE_COMMITTER_WEIGHT * commit_weight,
      )

  # Project static graph to dev nodes taking into account edge weights
  DG = bipartite.generic_weighted_projected_graph(
    SG,
    [node for node in SG.nodes() if str(node).startswith("dev:")],
    weight_function=get_projected_weight,
  )

  # Remove lone nodes from projected graph
  lone_nodes = list(nx.isolates(DG))
  DG.remove_nodes_from(lone_nodes)

  # Set node weights
  nx.set_node_attributes(DG, dict(DG.degree(weight="weight")), name="weight")

  # Initialize chart
  fig = plt.figure(figsize=(GRID_WIDTH * 10, GRID_HEIGHT * 10))
  gs = gridspec.GridSpec(GRID_HEIGHT, GRID_WIDTH, figure=fig, hspace = 0.3, wspace = 0.3)
  main_ax = fig.add_subplot(gs[1:(GRID_HEIGHT - 1), 1:(GRID_WIDTH - 1)])
  main_ax.grid(True, linestyle=":", alpha=0.1)
  main_ax.set_axis_off()

  community_axes = []
  for c in range(1, GRID_WIDTH - 1):
    community_axes.append(fig.add_subplot(gs[0, c]))
  for r in range(1, GRID_HEIGHT - 1):
    community_axes.append(fig.add_subplot(gs[r, GRID_WIDTH - 1]))
  for c in reversed(range(1, GRID_WIDTH - 1)):
    community_axes.append(fig.add_subplot(gs[GRID_HEIGHT - 1, c]))
  for r in reversed(range(1, GRID_HEIGHT - 1)):
    community_axes.append(fig.add_subplot(gs[r, 0]))

  logo_axes = [
    fig.add_subplot(gs[0, 0]),
    fig.add_subplot(gs[0, GRID_WIDTH - 1]),
    fig.add_subplot(gs[GRID_HEIGHT - 1, 0]),
    fig.add_subplot(gs[GRID_HEIGHT - 1, GRID_WIDTH - 1])
  ]

  # Highlight communities
  communities = sorted(louvain_communities(DG, seed=SEED), key=len, reverse=True)

  community_map = {}
  for community_id, community_nodes in enumerate(communities):
    for node in community_nodes:
      community_map[node] = community_id

  node_colors = [community_map[node] for node in DG.nodes()]

  # Scale edge tickness
  edge_weights = [d["weight"] for u, v, d in DG.edges(data=True)]
  max_weight = max(edge_weights) if edge_weights else 1
  edge_widths = [sqrt(w / max_weight) * EDGE_WIDTH_SCALE_FACTOR for w in edge_weights]
  # Scale node size
  node_sizes = [
    sqrt(DG.nodes[node]["weight"]) * NODE_SIZE_SCALE_FACTOR for node in DG.nodes()
  ]

  # Label top 10 nodes
  top_10_nodes = sorted(DG.degree(), key=lambda x: x[1], reverse=True)[:10]
  top_10_set = {node for node, degree in top_10_nodes}
  node_labels = {node: (node if node in top_10_set else "") for node in DG.nodes()}

  # Compute the layout
  forceatlas2 = ForceAtlas2(
    outboundAttractionDistribution=False,
    linLogMode=True,
    adjustSizes=True,        # Prevent node overlap (requires node sizes)
    edgeWeightInfluence=1.0, # Respect edge weights
    jitterTolerance=1.0,
    barnesHutOptimize=True,  # Essential for speed (>1000 nodes)
    barnesHutTheta=1.2,
    scalingRatio=2.0,
    strongGravityMode=False,
    gravity=1.1,
    verbose=True,
  )

  init_pos = nx.spring_layout(
    DG,
    seed=SEED,
    # k=0.05,            # Default is approximately 1/sqrt(num_nodes)
    iterations=500,  # Number of calculation steps
    weight="weight",  # Tells the spring engine to respect your commit weights
  )

  final_pos = forceatlas2.forceatlas2_networkx_layout(DG, pos=init_pos, iterations=100)

  # Draw main graph
  nx.draw_networkx(
    DG,
    ax=main_ax,
    pos=final_pos,
    with_labels=True,
    labels=node_labels,
    font_size=4,
    node_color=node_colors,
    cmap=plt.cm.tab20,
    node_size=node_sizes,
    edge_color="gainsboro",
    width=edge_widths,
  )

  # Draw community graphs
  for i, ax in enumerate(community_axes):
    ax.grid(True, linestyle=":", alpha=0.1)
    ax.set_box_aspect(1)

    if i < len(communities):
      CG = DG.subgraph(communities[i])

      nx.draw_networkx(
          CG,
          ax=ax,
          pos=nx.spring_layout(
            CG,
            seed=SEED,
            # k=0.05,            # Default is approximately 1/sqrt(num_nodes)
            iterations=250,  # Number of calculation steps
            weight="weight",  # Tells the spring engine to respect your commit weights
          ),
          with_labels=False,
          node_color=plt.cm.tab20(i),
          node_size=[
            sqrt(CG.nodes[node]["weight"]) * NODE_SIZE_SCALE_FACTOR for node in CG.nodes()
          ],
          edge_color="gainsboro",
          width=edge_widths,
        )
      
      ax.set_title(f"C{i+1} ({len(CG.nodes())} devs)", fontsize=12, fontweight="bold", pad=16)

  # Draw logo
  img_data = mpimg.imread("./logo.png")

  for ax in logo_axes:
    ax.set_axis_off()
    ax.set_box_aspect(1)

    ax.imshow(img_data, aspect="auto")

  # Save the active Matplotlib canvas directly to disk
  main_ax.set_title(f"Zcash Irondevs ({len(repos)} repos, {len(commits)} commits, {len(DG.nodes())} devs)", fontsize=16, fontweight="bold", pad=20)
  
  fig.savefig(OUTPUT_FILENAME, format="png", dpi=300, bbox_inches="tight")
  plt.close(fig)

  # Bridge nodes
  betweenness = nx.betweenness_centrality(DG, weight="weight")
  top_bridges = sorted(betweenness.items(), key=lambda x: x[1], reverse=True)[:10]

  # Final statistics
  end_time = perf_counter()
  print(
    f"Found {len(commits)} commits by {len(emails)} developers in {len(repos)} repositories from {start.date()} to {end.date()} in {end_time - start_time:.1f}s"
  )
  print(
    f"{DG} ({len(communities)} groups, {len(top_bridges)} bridges, {len(lone_nodes)} isolated nodes) in {OUTPUT_FILENAME}"
  )
  print(
    f"Top bridges: {', '.join([bridge[0].replace('dev:', '') for bridge in top_bridges])}"
  )


if __name__ == "__main__":
  main()
