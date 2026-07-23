# Heroes of Z10: ten years of Zcash, told through its people

Heroes of Z10 reads Zcash's git history and turns it into a dynamic co-authorship
network: a graph where nodes are people (deduplicated across the many
aliases the same human ends up committing under) and edges are how much
two people's work overlapped, tracked across twelve checkpoints tied to
Zcash's actual protocol upgrades, from the Zerocash paper in 2014 through
the present day and on to Ironwood's mainnet activation in 2026.

It is a real pipeline against real git history, not a mockup. Every number
in this README, and every number in the running app, comes from an actual
run against Zcash's public repositories.

## Try it

Live: **https://heroesofz10.vercel.app**

Or locally:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. The landing page links to `/explorer`, the
interactive network view.

## What it looks like

![The co-authorship network at the most recent checkpoint, colored by community, with a selected contributor's real GitHub avatar, stats, collaborators, and repositories in the side panel](docs/explorer-network.png)

This is a live screenshot, not a design mock. The circles are real
contributors, the coloring is a real Louvain community assignment, and the
selected contributor's avatar is their actual GitHub photo (see "GitHub
avatars" below for how that's sourced honestly).

## Required features, and where they live

| Required feature | Where |
| --- | --- |
| Bipartite author↔repo projection | `pipeline/graph.py` (`build_bipartite`, `project_coauthorship`) |
| Incremental updates | `pipeline/cache.py` (per-repo HEAD-based resume), `pipeline/mine.py` |
| Author deduplication | `pipeline/identity.py` (union-find over emails and normalized name spellings) |
| Custom time slicing | `pipeline/graph.py` (`build_snapshot`, cumulative or sliding-window mode), `pipeline/milestones.py` (the ten protocol upgrades, plus "Now" and the upcoming "Ironwood" checkpoint) |
| Web-based interactive visualization | `web/src/components/Explorer.tsx`, `web/src/components/GraphCanvas.tsx` |

## Extra features, and where they live

| Extra | Where |
| --- | --- |
| Multi-process support | `pipeline/mine.py` (`mine_all`, one process per repo via `ProcessPoolExecutor`) |
| Network analysis and metrics | `pipeline/graph.py` (weighted degree, betweenness centrality with sampling for scale, Louvain communities, density) |
| Bus factor (structural bridges) | `pipeline/graph.py` (`compute_bridges`: real graph articulation points, per connected component, not a guessed "importance" score), surfaced on the explorer's selected-contributor panel and each person's profile page. On the actual dev-sample archive this returns zero bridges at *every* checkpoint from Sprout launch onward, which is itself a real finding, not an inert feature: this collaboration graph has never had a single point of failure, at any size from 177 people to 608 |
| Temporal community analysis | `pipeline/temporal.py`: tracks whether each Louvain community *formed*, *continued*, *merged*, *split*, or *dissolved* between consecutive checkpoints, by comparing member-set overlap rather than community IDs (Louvain reruns independently each time, so IDs aren't stable across snapshots, membership is) |
| Causal (time-respecting) centrality | `pipeline/temporal_paths.py`, optional, off by default, see "The causal layer" below |
| GitHub avatars | `pipeline/identity.py` (`Identity.github_login`), `web/src/components/Explorer.tsx` (`Avatar`), see "GitHub avatars" below |

## How it works

**Mining.** `pipeline/mine.py` walks each bare repository with PyDriller,
reading commit metadata only (hash, author, committer, date, co-authors
parsed from `Co-authored-by:` trailers). It never touches file contents or
diffs, which is what keeps it safe to run against arbitrary mirrors and
fast enough to run in parallel, one process per repo. Each repo gets its
own cache file recording the last-seen HEAD, so a repo whose history
hasn't moved since the last run is skipped entirely, and a repo that has
moved is resumed from where mining left off rather than re-walked from
scratch.

**Identity resolution.** `pipeline/identity.py` merges the same person's
many git identities (work email, personal email, GitHub's generated
noreply address, name spelling drift, accented characters) using
union-find over normalized emails and normalized names, transitively: two
aliases merge if any single commit anywhere in the corpus bridges them.
Bots are tagged, not dropped, so CI activity is visible but distinguishable
from human contributors. That tagging also covers AI coding assistants:
real `Co-authored-by:` trailers from Claude, Codex, Copilot, and Gemini
show up throughout this ecosystem's actual commit history, and without
recognizing their specific, well-known addresses (`noreply@anthropic.com`,
`noreply@openai.com`, `noreply@google.com`, and GitHub's own
`noreply@github.com` merge-commit identity) they'd be indistinguishable
from a real person, accumulating co-authorship weight that belongs to
whichever human was directing the tool. Matched by address, not by name,
so a real contributor who happens to share a first name with an AI model
can't collide with it. This has to run in two passes over the corpus,
not one: a union-find root can shift as later commits reveal that two
previously-separate aliases are the same person, so anything computed from
an id resolved mid-corpus (which repo a contribution belongs to, its
commit count) would go stale by the end of a long run. `pipeline/graph.py`
registers every alias first, then looks up final, stable ids in a second
pass.

**The graph.** Each commit contributes weighted (author, repo) edges: the
author gets full weight, co-authors and a distinct committer get partial
weight, so a commit ghost-written by one person and landed by another
doesn't count as two equal authorships. For a given checkpoint, those
edges are summed into a bipartite author↔repo graph, with a recency decay
in cumulative mode so a checkpoint doesn't replay a decade-old commit at
full strength. That bipartite graph is then projected onto an author↔author
co-authorship graph: two people's tie strength through a shared repo is
bounded by whichever of them contributed *less* there (a weakest-link
projection), summed across every repo they both touched.

**Metrics.** Weighted degree, Louvain communities, and graph density are
computed directly. Betweenness centrality is exact for small graphs and
switches to pivot sampling once a snapshot passes a couple hundred nodes,
since exact betweenness is O(V·E) and the later checkpoints (hundreds of
contributors, thousands of edges) would make that impractical.

**Temporal community events.** `pipeline/temporal.py` compares each
checkpoint's Louvain partition against the previous one by Jaccard overlap
of member sets, and classifies what happened to each community: it
*formed* fresh, *continued* under one dominant predecessor, *merged* from
several, *split* into several successors, or *dissolved* with no strong
successor at all. That sequence of events is the narrative spine of the
"Chapters" panel in the explorer.

**Export.** `pipeline/export.py` writes one JSON archive: metadata, the
twelve milestones, every resolved identity, a snapshot per checkpoint in
both cumulative and sliding-window mode, the community event timeline, and
the optional causal-centrality layer if it ran. `web/public/data/z10-graph.json`
is that archive (edges trimmed to each node's strongest few for rendering
performance; the full edge count is kept alongside as `edgeCountFull` so
nothing about the trim is hidden).

**The frontend.** Next.js (App Router), TypeScript, Tailwind. The network
view is a hand-written canvas renderer, not a library: nodes are laid out
by clustering them around their current checkpoint's community (community
identity is not persistent across checkpoints, by design, since Louvain
reruns independently each time, which is exactly what the community-event
timeline is for), with a deterministic per-contributor jitter so the same
person doesn't reshuffle position for no reason between renders. Canvas
backing-store sizing runs off a `ResizeObserver`, not the animation loop,
and every state change (checkpoint, selection, search) forces one
synchronous paint in addition to the animation loop, both deliberately:
some hosting environments throttle or withhold `requestAnimationFrame`
entirely, and a network view that only updates when the browser feels like
scheduling a frame is a real bug, not a hypothetical one (see "Robustness"
below for how that surfaced).

## GitHub avatars

A bit over a fifth of the contributors in this dataset show a real GitHub
avatar in the explorer, sourced honestly: `identity.py` already collapses
a `12345+username@users.noreply.github.com` address down to `username`
during normalization, since that's just another alias for the same
person. Anything left in a resolved identity's email set with no `@` in
it therefore already *is* a real GitHub login, extracted from an address
GitHub itself generated for that account, not guessed or looked up. No
external API calls, no email-to-account scraping: contributors who never
used their GitHub-generated address in a commit simply show no avatar,
which is the honest outcome given what the data actually supports.

## Data used for development

This was built and tested against a sample of twelve real, actively
maintained Zcash-ecosystem repositories (`zcash/zcash`, `zcash/librustzcash`,
`zcash/zips`, `zcash/orchard`, `zcash/halo2`, `zcash/sapling-crypto`,
`zcash/lightwalletd`, `zcash/incrementalmerkletree`,
`ZcashFoundation/zebra`, `ZcashFoundation/frost`, `zingolabs/zingolib`,
`zingolabs/zaino`), cloned bare with `init.sh`'s approach. That's 50,981
commits resolving to 608 deduplicated authors (13 tagged as bots), producing
51 community formation/merge/split/continuation events across the twelve
checkpoints.

`zcash/zcash` needed one correction before it was trustworthy input:
it was forked from Bitcoin Core, so its own git log runs back to 2009 and
includes roughly five thousand commits from Bitcoin Core contributors who
never touched Zcash. `pipeline/repo_config.py` excludes anything in that
repo dated before this project's own first milestone (the Zerocash paper),
which is also, concretely, where genuine Zcash-specific work actually
starts appearing in that repo's real history. One side effect: the
"Zerocash paper" checkpoint itself now has zero people in it, since none of
the twelve mined repositories have any commit dated on or after that exact
day — the earliest real Zcash-specific work in the archive lands a few
months later. That's an honest gap in the underlying data, not a bug in
how it's sliced.

The full contest archive is 536 repositories across 28 owners, which this
was not run against directly (see the contributing guide: it's a private,
locally hosted 20GB mirror, meant to be run by its owner against the
complete archive rather than shared out for development). Everything
above, and everything in "Robustness" below, was built and stress-tested
against the real, running dev sample, not a synthetic stand-in.

## Running the pipeline yourself

```bash
uv sync
uv run irondevs --data-dir ../../data --cache-dir .cache --out web/public/data/z10-graph.json
```

Flags:

- `--workers N`: repos mined in parallel, one process each (default 4)
- `--force`: ignore the incremental cache and re-mine every repo from scratch
- `--causal` / `--no-causal`: attempt the optional causal-centrality layer (off by default, see below)

`data/<org>/<repo>.git` should hold bare clones, e.g.
`git clone --bare https://github.com/ZcashFoundation/zebra.git data/ZcashFoundation/zebra.git`.

## The causal layer

`pipeline/temporal_paths.py` is an optional extra: causal, time-respecting
betweenness centrality via PathpyG, answering a sharper question than
static betweenness can. Static betweenness can't tell a real, sequential
hand-off between two people apart from two people who simply share a repo
but never overlapped in time. A time-respecting measure can.

It is off by default, and that default is deliberate, not conservative for
its own sake: running it against this project's own eleven-repo dev sample
(278 people, on the order of 37,000 temporal edges) drove PathpyG's
implementation to roughly 7.5GB of resident memory before the operating
system's own out-of-memory killer stepped in, confirmed directly from
kernel logs, not inferred from a crash. An OOM kill happens beneath
Python's own error handling, so if this had defaulted to on, a large
enough run against the full archive could have taken the *entire* pipeline
down with it, not just this one optional layer. `analyze()` now refuses to
even attempt the computation past a conservative, explicitly-documented
edge-count cap (`MAX_TEMPORAL_EDGES` in `temporal_paths.py`), and skips
cleanly with a logged reason instead. Below that cap, on a small synthetic
graph, it was verified to genuinely work: real per-author centrality
scores came back correctly once a wrong import path (caught during that
same testing pass) was fixed. Every required contest feature is satisfied
without this layer running at all.

## Testing

```bash
uv run --extra dev pytest pipeline/tests
```

Unit tests cover the modules most likely to fail silently rather than
loudly: identity resolution (union-find merging across aliases, the
two-phase register/canonical split, bot detection including the specific
AI-coauthor and GitHub-automation addresses below), the graph math
(recency decay, the weakest-link projection, the render-time edge trim),
the bus-factor articulation-point computation, and the community
formed/continued/merged/split/dissolved classification. These are exactly
the areas where a subtle bug produces a wrong-but-plausible-looking number
instead of a crash.

## Robustness

Two failure modes were found and fixed by deliberately breaking things,
not just by reading the code and assuming it would hold:

- A corrupted cache sidecar (the kind a crash, a kill, or a full disk
  mid-write during a long run would produce) used to make that repo's
  *entire* commit history vanish from the archive silently, even though
  the underlying git repository was completely intact and re-minable.
  `RepoCache.load()` now treats a decode failure as an empty cache, which
  makes that one repo self-heal into a full re-mine rather than losing its
  history. `RepoCache.save()` now writes atomically (temp file, then
  rename) so a crash mid-write can no longer produce that corruption in
  the first place.
- A repository that fails outright (missing, corrupted, not actually a git
  repo) is reported and skipped; the rest of the archive still builds.
  Verified against a deliberately broken repo alongside a real one, not
  just asserted.

Re-running the same input twice produces byte-identical output for every
snapshot except the one checkpoint that's deliberately time-relative
("Now", used only until the Ironwood milestone itself has passed): only
its timestamp differs between runs, never any node, edge, or event.

## Known limitations

- The timeline carries both a "Now" checkpoint (today, the actual present)
  and a separate "Ironwood" checkpoint at its real mainnet activation date
  (28 July 2026), rather than collapsing the two: real preparatory work for
  Ironwood has already landed across several repositories well before
  activation (`zcash/zips`, `zcash/orchard`, `ZcashFoundation/zebra`, and
  others all have real `Co-authored-by`/merged `feat/ironwood` history), so
  it would be inaccurate to treat "no activation yet" as "no work has
  happened." Both checkpoints currently carry the same snapshot data,
  since cumulative slicing at a future date picks up the same commits as
  slicing at the present when nothing new has landed since -- that's the
  honest state, not a placeholder standing in for a guess at what Ironwood
  will look like once it's live.
- GitHub avatars appear for a bit over a fifth of contributors (134 of 608
  in this archive): exactly the ones whose own commits carry evidence of
  their GitHub login. Showing more
  would mean guessing, so this is a hard floor rather than something to fix.
- The causal-betweenness layer is real but intentionally not part of the
  default run; see "The causal layer" above.

## License

See `LICENSE.md`.
