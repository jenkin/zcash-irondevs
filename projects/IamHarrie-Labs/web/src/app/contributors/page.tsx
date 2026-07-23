import type { Metadata } from "next";
import Link from "next/link";
import { loadGraph } from "@/lib/data";
import { idToSlug, listContributors } from "@/lib/contributor";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Find yourself: Heroes of Z10",
  description: "Every human contributor in the dataset, with a shareable page for each one.",
};

export default async function ContributorsPage() {
  const graph = await loadGraph();
  const people = listContributors(graph);

  return (
    <div className="landing">
      <nav className="nav">
        <Link href="/" className="nav-brand" style={{ textDecoration: "none", color: "inherit" }}>
          Heroes of Z10
        </Link>
        <Link className="btn btn-primary" href="/explorer">
          Open the explorer
        </Link>
      </nav>

      <div className="wrap">
        <section className="hero" style={{ paddingBottom: "var(--half)" }}>
          <span className="kicker">Find yourself</span>
          <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 56px)", marginTop: 16 }}>
            <span className="line">{people.length} people wrote this decade.</span>
          </h1>
          <p className="sub" style={{ maxWidth: "56ch" }}>
            Every human contributor in the dataset gets their own page: peak
            era, closest collaborators, repositories. Find your name below.
          </p>
        </section>

        <hr className="rule" />

        <section className="features">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px 24px", marginTop: "var(--leading)" }}>
            {people.map((p) => (
              <Link
                key={p.id}
                href={`/contributor/${encodeURIComponent(idToSlug(p.id))}`}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 15, color: "inherit", textDecoration: "none", borderBottom: "1px solid var(--color-divider)", paddingBottom: 8 }}
              >
                <span>{p.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)", fontFeatureSettings: '"tnum" 1' }}>{fmtInt(p.commitCount)}</span>
              </Link>
            ))}
          </div>
        </section>

        <footer>Part of Heroes of Z10, ten years of Zcash&rsquo;s git history, annotated.</footer>
      </div>
    </div>
  );
}
