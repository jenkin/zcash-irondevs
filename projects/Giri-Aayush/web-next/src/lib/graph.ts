// Types + pure helpers for the co-authorship graph, ported from the vanilla build.

export type GNode = {
  id: string;
  name: string;
  org: string;
  is_bot: boolean;
  avatar: string | null;
  first: number;
  commits: number;
  repos: string[];
  monthly: number[];
  degree: number;
  betweenness: number;
  community: number;
  // mutable layout fields (added by d3)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  r?: number;
  deg?: number;
  dragDist?: number; // accumulated pointer travel of the current drag gesture
};

export type GLink = {
  source: string;
  target: string;
  birth: number;
  weight: number;
  shared_repos: string[];
  coauthored: number;
  monthly: Record<string, number>;
  // resolved endpoints (kept as ids; we look up positions via a map)
  s?: string;
  t?: string;
  w?: number;
};

export type GraphMeta = {
  months: string[];
  n_months: number;
  n_commits: number;
  n_contributors: number;
  n_contributors_total: number;
  n_edges: number;
  n_repos: number;
  repos: string[];
  commits_monthly: number[];
  generated_utc: string | null;
};

export type GraphDoc = {
  meta: GraphMeta;
  timeline: { month: number; nodes: number; edges: number; avg_degree: number; density: number }[];
  nodes: GNode[];
  links: GLink[];
};

export type Mode = "cumulative" | "window";
export type ColorBy = "community" | "org";
export type SizeBy = "commits" | "degree" | "betweenness";

export function rangeLo(month: number, mode: Mode, windowSize: number) {
  return mode === "window" ? Math.max(0, month - windowSize + 1) : 0;
}

export function nodeCommits(n: GNode, month: number, mode: Mode, windowSize: number) {
  const lo = rangeLo(month, mode, windowSize);
  let c = 0;
  for (let i = lo; i <= month; i++) c += n.monthly[i] || 0;
  return c;
}

export function linkWeight(l: GLink, month: number, mode: Mode, windowSize: number) {
  const lo = rangeLo(month, mode, windowSize);
  let w = 0;
  for (const k in l.monthly) {
    const m = +k;
    if (m >= lo && m <= month) w += l.monthly[k];
  }
  return w;
}

export function distinctCommits(meta: GraphMeta, month: number, mode: Mode, windowSize: number) {
  const lo = rangeLo(month, mode, windowSize);
  let c = 0;
  for (let i = lo; i <= month; i++) c += meta.commits_monthly[i] || 0;
  return c;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function prettyMonth(months: string[], m: number) {
  const [y, mo] = months[m].split("-");
  return { year: y, month: MONTH_NAMES[+mo - 1] };
}

// Default explore view: each person keeps their strongest BACKBONE_K ties, so everyone
// stays connected and visible but the drawing stays light and readable.
export const BACKBONE_K = 3;
export function backbone<T extends { s?: string; t?: string; w?: number }>(links: T[], k = BACKBONE_K): T[] {
  const byNode = new Map<string, T[]>();
  for (const l of links) for (const id of [l.s!, l.t!]) {
    const a = byNode.get(id);
    if (a) a.push(l); else byNode.set(id, [l]);
  }
  const keep = new Set<T>();
  for (const a of byNode.values()) {
    a.sort((x, y) => (y.w || 0) - (x.w || 0));
    for (let i = 0; i < Math.min(k, a.length); i++) keep.add(a[i]);
  }
  return links.filter((l) => keep.has(l));
}

export function computeStats(
  data: GraphDoc, month: number, mode: Mode, windowSize: number, minWeight: number, showBots: boolean,
  thin = false,
) {
  const active = data.nodes.filter(
    (n) => (showBots || !n.is_bot) && nodeCommits(n, month, mode, windowSize) > 0
  );
  const activeIds = new Set(active.map((n) => n.id));
  const deg = new Map<string, number>();
  let drawn: { s: string; t: string; w: number }[] = [];
  for (const l of data.links) {
    const s = l.s ?? l.source, t = l.t ?? l.target;
    if (!activeIds.has(s) || !activeIds.has(t)) continue;
    const w = linkWeight(l, month, mode, windowSize);
    if (w < minWeight) continue;
    drawn.push({ s, t, w });
  }
  if (thin) drawn = backbone(drawn);
  const ties = drawn.length;
  for (const { s, t } of drawn) {
    deg.set(s, (deg.get(s) || 0) + 1);
    deg.set(t, (deg.get(t) || 0) + 1);
  }
  // match the graph: when filtering by tie strength, isolated nodes are hidden
  const shown = minWeight > 1 ? active.filter((n) => (deg.get(n.id) || 0) > 0) : active;
  const N = shown.length;
  const density = N > 1 ? (2 * ties) / (N * (N - 1)) : 0;
  return {
    people: shown.filter((n) => !n.is_bot).length,
    ties,
    commits: distinctCommits(data.meta, month, mode, windowSize),
    density,
  };
}

// ── categorical palette (CVD-aware, muted-premium to match the design) ──
export const PALETTE = [
  "#45c49a", // green
  "#5c9bec", // blue
  "#ef7a6a", // coral
  "#c7c1b4", // silver
  "#e483b4", // pink
  "#a58cea", // violet
  "#e0a84e", // amber
  "#4fb6c7", // cyan
];
export const OTHER_COLOR = "#6b675e";

export type ColorModel = {
  color: (n: Pick<GNode, "community" | "org">) => string;
  clusters: { key: number | string; label: string; count: number; color: string }[];
};

export function buildColorModel(nodes: GNode[], colorBy: ColorBy): ColorModel {
  const humans = nodes.filter((n) => !n.is_bot);
  if (colorBy === "community") {
    const counts = new Map<number, number>();
    for (const n of humans) counts.set(n.community, (counts.get(n.community) || 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    const colorFor = new Map<number, string>();
    const label = new Map<number, string>();
    ranked.forEach((c, i) => {
      colorFor.set(c, i < PALETTE.length ? PALETTE[i] : OTHER_COLOR);
      const top = humans.filter((n) => n.community === c).sort((a, b) => b.commits - a.commits)[0];
      label.set(c, top ? `${top.name.split(" ")[0]}'s cluster` : `Cluster ${c}`);
    });
    const clusters = ranked
      .map((c) => ({ key: c, label: label.get(c)!, count: counts.get(c)!, color: colorFor.get(c)! }))
      .slice(0, 8);
    return { color: (n) => colorFor.get(n.community) || OTHER_COLOR, clusters };
  }
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.org, (counts.get(n.org) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
  const colorFor = new Map<string, string>();
  ranked.forEach((o, i) => colorFor.set(o, i < PALETTE.length ? PALETTE[i] : OTHER_COLOR));
  const clusters = ranked.map((o) => ({ key: o, label: o, count: counts.get(o)!, color: colorFor.get(o)! }));
  return { color: (n) => colorFor.get(n.org) || OTHER_COLOR, clusters };
}

// Zcash network-upgrade milestones for the timeline
export const MILESTONES: [string, string][] = [
  ["2016-10", "Sprout"],
  ["2018-10", "Sapling"],
  ["2020-07", "Heartwood"],
  ["2020-11", "Canopy"],
  ["2022-05", "NU5 · Orchard"],
  ["2024-11", "NU6"],
  ["2026-07", "Ironwood"],
];
