import Link from "next/link";
import { loadGraph } from "@/lib/data";

export default async function Home() {
  const graph = await loadGraph();
  const { meta } = graph;

  return (
    <div className="landing">
      <nav className="nav">
        <span className="nav-brand">Heroes of Z10</span>
        <a href="#method">The method</a>
        <a href="#interface">The interface</a>
        <Link href="/contributors">Find yourself</Link>
        <a href="#about">About</a>
        <Link className="btn btn-primary" href="/explorer">
          Open the explorer
        </Link>
      </nav>

      <div className="wrap">
        <section className="hero">
          <h1 className="display">
            <span className="line">Ten years of a protocol.</span>{" "}
            <span className="line">Told through its people.</span>
          </h1>
          <p className="sub">
            It goes through a decade of Zcash&rsquo;s git history commit by
            commit and builds a network of the people who wrote it: who
            worked with whom, and how that changed at each protocol upgrade.
            It&rsquo;s less about the code and more about the people behind
            it.
          </p>
          <div className="row">
            <Link className="btn btn-primary" href="/explorer">
              Open the explorer
            </Link>
            <a className="btn btn-ghost" href="#method">
              Read the method
            </a>
          </div>
        </section>

        <hr className="rule" />

        <section className="stats" aria-label="Heroes of Z10, by the numbers">
          <div className="grid">
            <div>
              <p className="stat-num gilt">{meta.commitCount.toLocaleString("en-US")}</p>
              <p className="stat-label">Commits read, 2014 to 2026</p>
            </div>
            <div>
              <p className="stat-num">{meta.repoCount}</p>
              <p className="stat-label">Repositories mined</p>
            </div>
            <div>
              <p className="stat-num">{meta.authorCount}</p>
              <p className="stat-label">People, deduplicated</p>
            </div>
            <div>
              <p className="stat-num">{graph.milestones.length}</p>
              <p className="stat-label">Checkpoints, one per upgrade</p>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section className="features" id="method">
          <span className="kicker">The method</span>
          <div className="cols">
            <div className="col">
              <h2>One person, many names</h2>
              <p>
                The same person often shows up under a work email, a personal
                one, and a few different spellings of their name. We match
                these back to one person with union-find, and we tag bots
                instead of just deleting them, so what you see is real
                people, not a pile of email addresses.
              </p>
            </div>
            <div className="col">
              <h2>Communities in time</h2>
              <p>
                At every checkpoint tied to a protocol upgrade, we run
                community detection and compare it to the one before: which
                groups formed, merged, split, or fell apart. It&rsquo;s like
                watching the project&rsquo;s org chart redraw itself, upgrade
                after upgrade.
              </p>
            </div>
            <div className="col">
              <h2>Real numbers, not a mockup</h2>
              <p>
                Every number on this page came out of an actual run of the
                pipeline against Zcash&rsquo;s public git history. None of it
                is placeholder data: the commit counts, the identities, and
                the network metrics are all real.
              </p>
            </div>
          </div>
        </section>

        <section className="split" id="interface">
          <div className="split-copy">
            <span className="kicker">The interface</span>
            <h2 className="split-title">A network you can scrub through time</h2>
            <p className="note" style={{ maxWidth: "48ch", marginTop: "14px" }}>
              A timeline tied to the upgrades drives the whole view. Drag it
              and watch a handful of early cryptographers grow into hundreds
              of contributors, with the clusters reshaping as the years go
              by. You can search for a name, look up one person&rsquo;s whole
              decade, or read through the chapters, where the community
              changes are told as a story instead of buried in a tooltip.
            </p>
          </div>
        </section>

        <section className="quote">
          <figure>
            <blockquote>
              &ldquo;By Orchard, the zcashd bench and the Zebra bench are
              distinct rooms, joined by the few people who carry work between
              them.&rdquo;
            </blockquote>
            <figcaption>Chapter VIII of XI, NU5, May 2022</figcaption>
          </figure>
        </section>

        <hr className="rule" />

        <section className="close" id="about">
          <h3>About this project</h3>
          <p className="sub">
            Heroes of Z10 reads Zcash&rsquo;s public git history directly. It
            mines every commit with PyDriller, works out who&rsquo;s who
            with union-find deduplication, and builds a weighted
            co-authorship network tracked across eleven checkpoints.
            Everything ships as a static export: the whole decade is
            precomputed ahead of time, there&rsquo;s no backend, and the
            code is written to be read, not just run.
          </p>
          <div style={{ display: "flex", gap: "14px", marginTop: "28px" }}>
            <Link className="btn btn-primary" href="/explorer">
              Open the explorer
            </Link>
          </div>
        </section>

        <footer>Heroes of Z10. Ten years of Zcash&rsquo;s git history, annotated.</footer>
      </div>
    </div>
  );
}
