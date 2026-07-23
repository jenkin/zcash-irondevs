import type { SnapshotNode } from "./graph-types";

/** Deterministic PRNG seeded from a string id, so a contributor's jitter
 * (angle within their community cluster) stays stable across snapshots and
 * across reloads, instead of reshuffling on every render like Math.random
 * would. */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface JitterEntry {
  angle: number;
  u: number;
}

const jitterCache = new Map<string, JitterEntry>();

export function jitterFor(id: string): JitterEntry {
  const cached = jitterCache.get(id);
  if (cached) return cached;
  const rng = mulberry32(seedFromId(id));
  const entry = { angle: rng() * Math.PI * 2, u: 0.15 + 0.85 * rng() };
  jitterCache.set(id, entry);
  return entry;
}

export const COMMUNITY_COLORS = [
  "#201f1d", // ink
  "#7d5411", // deep gold
  "#b68235", // gold
  "#9b9797", // gray
  "#5a6b5e", // slate
  "#6b4f5a", // plum
  "#4a5f6e", // steel
  "#7a6a3f", // olive
];

export function colorForCommunity(id: number): string {
  if (id < 0) return COMMUNITY_COLORS[3];
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length];
}

export interface LaidOutNode extends SnapshotNode {
  tx: number;
  ty: number;
}

/** Cluster nodes by their (per-snapshot) Louvain community around evenly
 * spaced centers, sized by member count -- community *identity* isn't
 * tracked as persistent across checkpoints (Louvain reruns independently
 * each time, which is what `communityEvents` narrates), so re-clustering
 * every checkpoint is the correct behavior, not an approximation. */
export function layoutSnapshot(nodes: SnapshotNode[], width: number, height: number): LaidOutNode[] {
  const byCommunity = new Map<number, SnapshotNode[]>();
  for (const n of nodes) {
    const list = byCommunity.get(n.community) ?? [];
    list.push(n);
    byCommunity.set(n.community, list);
  }
  const communities = [...byCommunity.keys()].sort((a, b) => a - b);
  const cx = width / 2;
  const cy = height / 2;
  // Scales with how many clusters actually have to share the ring -- a
  // fixed fraction of the canvas left early checkpoints (few, large
  // communities) looking fine but crowded later ones (more, smaller
  // communities) with barely any gap between neighboring clusters.
  const ringR = Math.min(width, height) * (0.32 + Math.min(0.16, 0.02 * Math.max(0, communities.length - 3)));

  const out: LaidOutNode[] = [];
  communities.forEach((commId, i) => {
    const members = byCommunity.get(commId)!;
    const theta = communities.length > 1 ? (i / communities.length) * Math.PI * 2 : 0;
    const centerX = communities.length > 1 ? cx + Math.cos(theta) * ringR : cx;
    const centerY = communities.length > 1 ? cy + Math.sin(theta) * ringR * 0.72 : cy;
    const R = 34 + 9 * Math.sqrt(members.length);
    for (const n of members) {
      const { angle, u } = jitterFor(n.id);
      out.push({
        ...n,
        tx: centerX + Math.cos(angle) * Math.sqrt(u) * R * 1.15,
        ty: centerY + Math.sin(angle) * Math.sqrt(u) * R * 0.85,
      });
    }
  });
  return out;
}

export function nodeRadius(degree: number): number {
  return 2.2 + Math.log(degree + 2) * 1.05;
}

/** Name a community by its members' single most common top repo, not a fixed
 * or invented label -- Louvain communities aren't tagged with a name, and
 * community identity isn't even stable across checkpoints, so the only
 * honest label is whatever the data itself says this group mostly worked on
 * right now. Falls back to "Community <n>" when no member has a recorded
 * repo (e.g. a bipartite edge case) or ties are empty. */
export function labelForCommunity(members: SnapshotNode[], communityId: number): string {
  const counts = new Map<string, number>();
  for (const m of members) {
    const top = m.repos[0];
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [repo, count] of counts) {
    if (count > bestCount) {
      best = repo;
      bestCount = count;
    }
  }
  if (!best) return `Community ${communityId + 1}`;
  const short = best.includes("/") ? best.slice(best.indexOf("/") + 1) : best;
  return short.toUpperCase();
}

function rankedRepoLabels(members: SnapshotNode[]): string[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const top = m.repos[0];
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([repo]) => (repo.includes("/") ? repo.slice(repo.indexOf("/") + 1) : repo).toUpperCase());
}

/** Labels every community shown *at the same time* in one pass, resolving
 * collisions -- early in Zcash's history almost everyone's top repo is
 * `zcash/zcash` itself, so several distinct communities can each want the
 * same "ZCASH" label simultaneously, which reads as one group split into
 * duplicate circles rather than what it actually is. Bigger communities get
 * first pick of their preferred label; anyone who loses a collision tries
 * their next most common repo instead of the same name twice, falling back
 * to "Community N" only once every one of their repos is already taken. */
export function labelCommunities(byCommunity: Map<number, SnapshotNode[]>): Map<number, string> {
  const candidates = new Map<number, string[]>();
  for (const [commId, members] of byCommunity) {
    candidates.set(commId, rankedRepoLabels(members));
  }

  const order = [...byCommunity.entries()].sort((a, b) => b[1].length - a[1].length).map(([id]) => id);
  const taken = new Set<string>();
  const labels = new Map<number, string>();
  for (const commId of order) {
    const pick = (candidates.get(commId) ?? []).find((c) => !taken.has(c));
    if (pick) {
      taken.add(pick);
      labels.set(commId, pick);
    } else {
      labels.set(commId, `Community ${commId + 1}`);
    }
  }
  return labels;
}
