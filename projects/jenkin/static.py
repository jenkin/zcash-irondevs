from time import perf_counter
from math import sqrt
import matplotlib.pyplot as plt
plt.close('all')
from datetime import datetime, timedelta, timezone
from pathlib import Path
from pydriller import Repository
import numpy as np
import networkx as nx
from networkx.algorithms import bipartite
from networkx.algorithms.community import louvain_communities

# Role weights
ROLE_AUTHOR_WEIGHT = 1.0
ROLE_COAUTHOR_WEIGHT = 0.66
ROLE_COMMITTER_WEIGHT = 0.33

# Global constants
SEED = 42
NOW = datetime.now(timezone.utc)
START_DATE = datetime(2013, 6, 24, tzinfo=timezone.utc) # Zerocoin paper
DECAY_RATE_PER_DAY = 0.001
OUTPUT_TITLE = "Zcash Irondevs (static)"
OUTPUT_FILENAME = "zcash_irondevs_static.png"

# Initial graph
SG = nx.Graph()

def time_decay(source: datetime, target: datetime, decay_rate: float) -> float:
    """Computes exact exponential decay for any continuous point in time."""
    if target < source:
        raise ValueError("Target date cannot be before the start date.")
        
    # Calculate continuous time delta (including hours/minutes/seconds if provided)
    time_delta = target - source
    days_elapsed = time_delta.total_seconds() / 86400.0  # Continuous float value
    
    # Compute continuous decay: N(t) = N0 * e^(-lambda * t)
    return np.exp(-decay_rate * days_elapsed)

def update_edge(u: str, v: str, weight: float) -> None:
  """Update or create an edge in the static graph."""
  s_edge = SG.get_edge_data(u, v)

  if s_edge is not None:
    # Update the existing live dictionary directly
    SG[u][v]["weight"] = s_edge.get("weight", 0) + weight
  else:
    # No interaction exists yet; create a new edge
    SG.add_edge(u, v, weight=weight)

def is_bot(email: str) -> bool:
  """[WIP] Commits authored by bots (ie. renovate, github bot, ci/cd pipelines)"""
  return "no-reply" in email or "noreply" in email or "github.com" in email

def get_projected_weight(G: nx.Graph, u: str, v: str):
  """Compute projected weights as sum of the weakest edges"""
  w = 0

  for nbr in set(G[u]) & set(G[v]):
    w += min(G[u][nbr].get("weight", 0), G[v][nbr].get("weight", 0))
  
  return w

def main():
  start_time = perf_counter()
  data = Path("../../data")

  commits = 0
  emails = set()
  repos = set()
  start = datetime.max.replace(tzinfo=timezone.utc)
  end = datetime.min.replace(tzinfo=timezone.utc)

  for commit in Repository([str(repo) for repo in data.glob('./*/*.git') if repo.is_dir()]).traverse_commits():
    # Skip merge commit
    if commit.merge:
      continue

    # Transform all date in UTC
    committer_date = commit.committer_date.replace(tzinfo=timezone(timedelta(seconds=commit.committer_timezone)))

    # Skip commits before Zerocoin paper
    if committer_date < START_DATE:
      continue

    # Count commits
    commits += 1

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
    commit_weight = time_decay(START_DATE, committer_date, DECAY_RATE_PER_DAY)

    # Create or update an author <-> repository edge
    if not is_bot(commit.author.email):
      update_edge(
        f"dev:{commit.author.email}",
        f"repo:{commit.project_name}",
        ROLE_AUTHOR_WEIGHT * commit_weight
      )

    # Create or update the co-author <-> repository edges
    for co_author in commit.co_authors:
      # Ignore co-author that is also the primary author
      if co_author.email == commit.author.email:
        continue

      if is_bot(co_author.email):
        continue

      update_edge(
        f"dev:{co_author.email}",
        f"repo:{commit.project_name}",
        ROLE_COAUTHOR_WEIGHT * commit_weight
      )

    # Create or update the committeer <-> repository edge
    # Ignore committer that is also the primary author or a co-author
    if commit.committer.email != commit.author.email and commit.committer.email not in [co_author.email for co_author in commit.co_authors] and not is_bot(commit.committer.email):
      update_edge(
        f"dev:{commit.committer.email}",
        f"repo:{commit.project_name}",
        ROLE_COMMITTER_WEIGHT * commit_weight
      )

  # Project static graph to dev nodes taking into account edge weights
  DG = bipartite.generic_weighted_projected_graph(
    SG,
    [node for node in SG.nodes() if str(node).startswith("dev:")],
    weight_function = get_projected_weight
  )

  # Remove lone nodes from projected graph
  lone_nodes = list(nx.isolates(DG))
  DG.remove_nodes_from(lone_nodes)

  # Initialize chart
  fig, ax = plt.subplots(figsize=(12, 12))

  # Highlight communities
  communities = louvain_communities(DG, seed=SEED)

  community_map = {}
  for community_id, community_nodes in enumerate(communities):
    for node in community_nodes:
        community_map[node] = community_id

  node_colors = [community_map[node] for node in DG.nodes()]

  # Scale edge tickness
  edge_weights = [d["weight"] for u, v, d in DG.edges(data=True)]
  max_weight = max(edge_weights) if edge_weights else 1
  edge_widths = [sqrt(w / max_weight) * 1.2 for w in edge_weights]

  # Label top 10 nodes
  top_10_nodes = sorted(DG.degree(), key=lambda x: x[1], reverse=True)[:10]
  top_10_set = {node for node, degree in top_10_nodes}
  node_labels = {node: (node if node in top_10_set else "") for node in DG.nodes()}

  # Compute the layout
  pos = nx.spring_layout(
    DG,
    seed=SEED,
    # k=0.5,            # Default is approximately 1/sqrt(num_nodes)
    iterations=500,     # Number of calculation steps
    weight="weight"     # Tells the spring engine to respect your commit weights
  )

  # Draw
  nx.draw_networkx(
    DG,
    ax=ax,
    pos=pos,
    with_labels=True,
    labels=node_labels,
    font_size=4,
    node_color=node_colors,
    cmap=plt.cm.tab20,
    node_size=2,
    edge_color="gainsboro",
    width=edge_widths
  )

  # Save the active Matplotlib canvas directly to disk
  ax.set_title(OUTPUT_TITLE, fontsize=16, fontweight="bold", pad=20)
  ax.axis("off") # Hides the bounding box axis lines
  fig.savefig(OUTPUT_FILENAME, format="png", dpi=300, bbox_inches="tight")
  plt.close(fig)

  # Final statistics
  end_time = perf_counter()
  print(f"Found {commits} commits by {len(emails)} developers in {len(repos)} repositories from {start.date()} to {end.date()} in {end_time - start_time:.1f}s")
  print(f"{DG} ({len(communities)} groups, {len(lone_nodes)} isolated nodes) in {OUTPUT_FILENAME}")

if __name__ == "__main__":
  main()
