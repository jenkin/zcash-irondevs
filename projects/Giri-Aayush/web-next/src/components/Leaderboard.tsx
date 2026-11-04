"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useViz } from "@/lib/store";
import { buildColorModel } from "@/lib/graph";

// Bubblemaps-style ranked rail: the map and this list are two views of the
// same ranking. Click a row and the camera flies to that person.
export default function Leaderboard() {
  const { data, colorBy, showBots, story, selected, set, setMonth } = useViz();

  const rows = useMemo(() => {
    if (!data) return [];
    const model = buildColorModel(data.nodes, colorBy);
    const total = data.nodes.reduce((s, n) => s + n.commits, 0) || 1;
    return data.nodes
      .filter((n) => showBots || !n.is_bot)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 24)
      .map((n, i) => ({ n, rank: i + 1, pct: (100 * n.commits) / total, color: model.color(n) }));
  }, [data, colorBy, showBots]);

  if (!data) return null;

  // jump like search does: leave the story, show the clean network, focus them
  const focus = (id: string) => {
    const st = useViz.getState();
    set("story", false);
    set("playing", false);
    set("minWeight", st.cleanMinWeight);
    setMonth(data.meta.n_months - 1);
    set("selected", id);
  };

  const open = !story && !selected;

  // during the story, a slim chip marks where the rail lives; clicking it
  // skips ahead into explore with the leaderboard open
  const chip = story && !selected;

  return (
    <AnimatePresence>
      {chip && (
        <motion.button
          key="chip"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          onClick={() => {
            const st = useViz.getState();
            set("story", false);
            set("playing", false);
            set("minWeight", st.cleanMinWeight);
            setMonth(data.meta.n_months - 1);
          }}
          className="glass label pointer-events-auto absolute right-3 top-24 z-20 hidden items-center gap-2 px-3.5 py-2.5 lg:flex"
        >
          <span className="text-gold">◈</span> Top contributors
        </motion.button>
      )}
      {open && (
        <motion.aside
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="glass pointer-events-auto absolute bottom-28 right-3 top-24 z-20 hidden w-[228px] flex-col overflow-hidden lg:flex"
          aria-label="Top contributors"
        >
          <div className="flex items-baseline justify-between px-3.5 pb-2 pt-3">
            <span className="label">Top contributors</span>
            <span className="mono tnum text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              of {data.meta.n_contributors_total ?? data.nodes.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {rows.map(({ n, rank, pct, color }) => (
              <button
                key={n.id}
                onClick={() => focus(n.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="mono tnum w-[18px] flex-none text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  {rank}
                </span>
                {n.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- static local avatar
                  <img src={n.avatar} alt="" className="size-5 flex-none rounded-full object-cover" style={{ border: `1px solid ${color}` }} />
                ) : (
                  <span className="size-5 flex-none rounded-full" style={{ background: color }} />
                )}
                <span className="truncate text-[11.5px] text-foreground/80">{n.name}</span>
                <span className="mono tnum ml-auto flex-none text-[10px] text-gold">{pct.toFixed(1)}%</span>
              </button>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
