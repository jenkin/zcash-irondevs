import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGraph } from "@/lib/data";
import { buildContributorProfile, idToSlug, slugToId } from "@/lib/contributor";
import { fmtInt } from "@/lib/format";
import MusicButton from "@/components/MusicButton";
import ShareButton from "./ShareButton";

export async function generateStaticParams() {
  const graph = await loadGraph();
  return Object.keys(graph.identities).map((id) => ({ id: idToSlug(id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawSlug } = await params;
  const graph = await loadGraph();
  const profile = buildContributorProfile(graph, slugToId(decodeURIComponent(rawSlug)));
  if (!profile) return { title: "Not found: Heroes of Z10" };
  return {
    title: `${profile.name}'s decade in Zcash: Heroes of Z10`,
    description: `${fmtInt(profile.commitCount)} commits, peak at ${profile.peakMilestone}, part of ${profile.communityLabel ?? "the Zcash contributor network"}.`,
  };
}

export default async function ContributorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawSlug } = await params;
  const id = slugToId(decodeURIComponent(rawSlug));
  const graph = await loadGraph();
  const profile = buildContributorProfile(graph, id);
  if (!profile) notFound();

  return (
    <div className="landing">
      <nav className="nav">
        <Link href="/" className="nav-brand" style={{ textDecoration: "none", color: "inherit" }}>
          Heroes of Z10
        </Link>
        <Link href="/contributors">Find someone else</Link>
        <Link className="btn btn-primary" href={`/explorer?sel=${encodeURIComponent(profile.id)}`}>
          See them in the network
        </Link>
        <MusicButton />
      </nav>

      <div className="wrap" style={{ maxWidth: 720 }}>
        <section className="hero" style={{ paddingBottom: "var(--leading)" }}>
          <span className="kicker">A decade in Zcash</span>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16 }}>
            {profile.githubLogin ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://github.com/${profile.githubLogin}.png?size=160`}
                alt=""
                width={80}
                height={80}
                style={{ width: 80, height: 80, borderRadius: "50%", border: "1px solid var(--color-divider)", objectFit: "cover", flex: "none" }}
              />
            ) : (
              <div
                aria-hidden
                style={{ width: 80, height: 80, borderRadius: "50%", border: "1px solid var(--color-divider)", background: "color-mix(in srgb, var(--color-text) 6%, transparent)", flex: "none" }}
              />
            )}
            <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.05 }}>
              {profile.name}
            </h1>
          </div>
          <p className="sub" style={{ maxWidth: "56ch" }}>
            {profile.isBot
              ? `An automated account, active from ${profile.firstMilestone} to ${profile.lastMilestone}.`
              : profile.firstMilestone === profile.lastMilestone
                ? `Active around ${profile.firstMilestone}.`
                : profile.peakMilestone === profile.lastMilestone
                  ? `Active from ${profile.firstMilestone} to ${profile.lastMilestone}, busiest right up to the end.`
                  : `Active from ${profile.firstMilestone} to ${profile.lastMilestone}, with their busiest stretch around ${profile.peakMilestone}.`}
          </p>
          {profile.isBridge && (
            <p style={{ fontSize: 12.5, color: "var(--color-accent-700)", margin: "10px 0 0" }}>
              At their peak, they were a structural bridge: the graph shows no other path connecting parts of their community without them.
            </p>
          )}
        </section>

        <hr className="rule" />

        <section className="stats" aria-label="Their numbers">
          <div className="grid">
            <div>
              <p className="stat-num gilt">{fmtInt(profile.commitCount)}</p>
              <p className="stat-label">Commits attributed</p>
            </div>
            <div>
              <p className="stat-num">
                {profile.rank} <span style={{ fontSize: "0.5em" }}>/ {profile.totalAtPeak}</span>
              </p>
              <p className="stat-label">Rank by degree, at their peak</p>
            </div>
            <div>
              <p className="stat-num">{profile.aliasCount}</p>
              <p className="stat-label">{profile.aliasCount === 1 ? "Git identity" : "Git identities merged"}</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p
                className="stat-num"
                style={{
                  fontSize: (profile.communityLabel?.length ?? 0) > 10 ? "clamp(16px, 2vw, 28px)" : undefined,
                  overflowWrap: (profile.communityLabel?.length ?? 0) > 10 ? "anywhere" : undefined,
                  wordBreak: (profile.communityLabel?.length ?? 0) > 10 ? "break-word" : undefined,
                }}
              >
                {profile.communityLabel ?? "Unaffiliated"}
              </p>
              <p className="stat-label">Community, at their peak</p>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section className="features">
          <span className="kicker">Closest collaborators</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, maxWidth: "48ch" }}>
            {profile.collaborators.length === 0 && <p style={{ fontSize: 15 }}>No recorded ties at their peak checkpoint.</p>}
            {profile.collaborators.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, borderBottom: "1px solid var(--color-divider)", paddingBottom: 8 }}>
                <span>{c.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{c.weight.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        <section className="close">
          <h3>Repositories</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {profile.repos.length === 0 && <span style={{ fontSize: 14 }}>None recorded.</span>}
            {profile.repos.map((r) => (
              <span key={r} className="tag tag-neutral">
                {r}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
            <Link className="btn btn-primary" href={`/explorer?sel=${encodeURIComponent(profile.id)}`}>
              See them in the network
            </Link>
            <ShareButton />
          </div>
        </section>

        <footer>Part of Heroes of Z10, ten years of Zcash&rsquo;s git history, annotated.</footer>
      </div>
    </div>
  );
}
