"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useViz } from "@/lib/store";
import { buildColorModel } from "@/lib/graph";

export default function SelectionCard() {
  const { data, selected, colorBy, set } = useViz();

  const info = useMemo(() => {
    if (!data || !selected) return null;
    const n = data.nodes.find((x) => x.id === selected);
    if (!n) return null;
    const model = buildColorModel(data.nodes, colorBy);
    const color = model.color(n);
    const cluster = model.clusters.find((c) => String(c.key) === String(colorBy === "community" ? n.community : n.org));
    const nb: { id: string; w: number }[] = [];
    for (const l of data.links) {
      const s = l.s ?? l.source, t = l.t ?? l.target;
      if (s === n.id) nb.push({ id: t, w: l.weight });
      else if (t === n.id) nb.push({ id: s, w: l.weight });
    }
    nb.sort((a, b) => b.w - a.w);
    const collabs = nb.slice(0, 6)
      .map((x) => ({ node: data.nodes.find((m) => m.id === x.id)!, w: x.w }))
      .filter((x) => x.node);
    const firstYear = data.meta.months[n.first]?.split("-")[0];
    // cluster aggregate, Bubblemaps-style: how much of the codebase this group carries
    const key = String(colorBy === "community" ? n.community : n.org);
    const members = data.nodes.filter((m) => String(colorBy === "community" ? m.community : m.org) === key);
    const totalCommits = data.nodes.reduce((s, m) => s + m.commits, 0) || 1;
    const clusterPct = (100 * members.reduce((s, m) => s + m.commits, 0)) / totalCommits;
    return { n, color, cluster, ties: nb.length, collabs, firstYear, clusterSize: members.length, clusterPct };
  }, [data, selected, colorBy]);

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ x: 40, opacity: 0, filter: "blur(6px)" }}
          animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ x: 40, opacity: 0, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 280, damping: 30 }}
          className="glass pointer-events-auto absolute right-3 top-24 z-30 w-[288px] overflow-hidden p-4 sm:top-1/2 sm:-translate-y-1/2"
        >
          <button
            onClick={() => set("selected", null)}
            aria-label="Close"
            className="absolute right-2 top-2 grid size-11 place-items-center rounded-md text-foreground/45 hover:bg-white/[0.06] hover:text-foreground sm:right-3 sm:top-3 sm:size-7"
          >
            ✕
          </button>

          {/* header */}
          <div className="flex items-center gap-3 pr-6">
            {info.n.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- static local avatar
              <img src={info.n.avatar} alt="" className="size-14 flex-none rounded-full object-cover"
                style={{ border: `2px solid ${info.color}`, boxShadow: `0 0 16px -4px ${info.color}` }} />
            ) : (
              <span className="size-14 flex-none rounded-full" style={{ background: info.color, boxShadow: `0 0 16px -4px ${info.color}` }} />
            )}
            <div className="min-w-0">
              <div className="font-display truncate text-[17px] font-semibold leading-tight">{info.n.name}</div>
              <div className="label mt-1 truncate" style={{ letterSpacing: "0.08em" }}>{info.n.org}</div>
            </div>
          </div>

          {/* cluster + its weight in the codebase */}
          {info.cluster && (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-[12px] text-foreground/70">
                <span className="size-2.5 rounded-[3px]" style={{ background: info.color, boxShadow: `0 0 8px -2px ${info.color}` }} />
                <span className="truncate">{info.cluster.label}</span>
              </div>
              <div className="label mt-1 pl-[18px]" style={{ letterSpacing: "0.08em" }}>
                {info.clusterSize} people · {info.clusterPct.toFixed(1)}% of commits
              </div>
            </div>
          )}

          {/* stats */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Commits", value: info.n.commits.toLocaleString() },
              { label: "Ties", value: String(info.ties) },
              { label: "Since", value: info.firstYear ?? "n/a" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                <div className="font-display tnum text-[16px] font-semibold leading-none">{s.value}</div>
                <div className="label mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* repos */}
          {info.n.repos.length > 0 && (
            <div className="mt-4">
              <div className="label mb-1.5">Repositories</div>
              <div className="flex flex-wrap gap-1.5">
                {info.n.repos.slice(0, 8).map((r) => (
                  <span key={r} className="mono rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-foreground/65">
                    {r.split("/").pop()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* top collaborators, click to jump */}
          {info.collabs.length > 0 && (
            <div className="mt-4">
              <div className="label mb-1.5">Closest collaborators</div>
              <div className="flex flex-col gap-1">
                {info.collabs.map(({ node, w }) => (
                  <button
                    key={node.id}
                    onClick={() => set("selected", node.id)}
                    className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    {node.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static local avatar
                      <img src={node.avatar} alt="" className="size-6 flex-none rounded-full object-cover" style={{ border: `1px solid ${buildColorModel(data!.nodes, colorBy).color(node)}` }} />
                    ) : (
                      <span className="size-6 flex-none rounded-full" style={{ background: buildColorModel(data!.nodes, colorBy).color(node) }} />
                    )}
                    <span className="truncate text-[12px] text-foreground/80">{node.name}</span>
                    <span className="mono tnum ml-auto text-[10px] text-gold">{w}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
