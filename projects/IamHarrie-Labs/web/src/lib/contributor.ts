import type { GraphData } from "./graph-types";
import { labelForCommunity } from "./layout";

// Every identity key from identity.py's union-find is "<prefix>:<rest>"
// (a single-char prefix, a colon, then the rest -- e.g. "n:krisnuttycom" or
// an email-derived "e:someone@example.com"). A colon is reserved in Windows
// paths, and this route's pages are files on disk at build time (via
// generateStaticParams), so the id can't be used as the route param
// directly -- it works fine on Vercel's Linux build servers, but silently
// can't be verified with a local build on Windows. Encoding the *fixed
// position* colon as "--" instead sidesteps the problem everywhere, and
// works by position, not by searching for a delimiter, so it can't collide
// with a dash that was already part of an email/name.
export function idToSlug(id: string): string {
  return id.slice(0, 1) + "--" + id.slice(2);
}

export function slugToId(slug: string): string {
  return slug.slice(0, 1) + ":" + slug.slice(3);
}

export interface ContributorProfile {
  id: string;
  name: string;
  isBot: boolean;
  commitCount: number;
  aliasCount: number;
  githubLogin: string | null;
  firstMilestone: string;
  lastMilestone: string;
  peakMilestone: string;
  communityLabel: string | null;
  rank: number;
  totalAtPeak: number;
  isBridge: boolean;
  repos: string[];
  collaborators: { id: string; name: string; weight: number }[];
}

/** Everyone's card is built from their own *peak* checkpoint, not the final
 * decayed "Now" snapshot -- someone who was central in 2016 and quiet since
 * would otherwise show up with a faded, decayed version of themselves. This
 * is meant to read as "here's your decade," not "here's what's left of you
 * after ten years of recency decay." */
export function buildContributorProfile(graph: GraphData, id: string): ContributorProfile | null {
  const identity = graph.identities[id];
  if (!identity) return null;

  const appearances = graph.snapshots
    .map((s, i) => ({ i, node: s.nodes.find((n) => n.id === id) }))
    .filter((a): a is { i: number; node: NonNullable<(typeof a)["node"]> } => !!a.node);
  if (appearances.length === 0) return null;

  const peak = appearances.reduce((a, b) => (b.node.degree > a.node.degree ? b : a));
  const peakSnapshot = graph.snapshots[peak.i];

  const collaborators = peakSnapshot.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => ({ id: e.source === id ? e.target : e.source, weight: e.weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((c) => ({ ...c, name: peakSnapshot.nodes.find((n) => n.id === c.id)?.name ?? c.id }));

  const rankedAtPeak = [...peakSnapshot.nodes].sort((a, b) => b.degree - a.degree);
  const rank = rankedAtPeak.findIndex((n) => n.id === id) + 1;

  const communityLabel =
    peak.node.community >= 0
      ? labelForCommunity(
          peakSnapshot.nodes.filter((n) => n.community === peak.node.community),
          peak.node.community,
        )
      : null;

  return {
    id,
    name: identity.name,
    isBot: identity.isBot,
    commitCount: identity.commitCount,
    aliasCount: identity.aliasCount,
    githubLogin: identity.githubLogin,
    firstMilestone: graph.milestones[appearances[0].i].name,
    lastMilestone: graph.milestones[appearances[appearances.length - 1].i].name,
    peakMilestone: graph.milestones[peak.i].name,
    communityLabel,
    rank,
    totalAtPeak: peakSnapshot.nodes.length,
    isBridge: peak.node.isBridge,
    repos: peak.node.repos,
    collaborators,
  };
}

/** The directory list: human contributors only, ranked by lifetime commit
 * count -- bots are real data and shouldn't be hidden elsewhere, but a
 * "find yourself" listing is specifically for people. identity.py's is_bot
 * now recognizes AI coding assistants and GitHub's own merge-commit actor
 * (real Co-Authored-By trailers, not fabricated), so that single pipeline
 * flag is the whole filter here. */
export function listContributors(graph: GraphData): { id: string; name: string; commitCount: number }[] {
  return Object.entries(graph.identities)
    .filter(([, ident]) => !ident.isBot)
    .map(([id, ident]) => ({ id, name: ident.name, commitCount: ident.commitCount }))
    .sort((a, b) => b.commitCount - a.commitCount);
}
