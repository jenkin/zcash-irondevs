"use client";

import { AnimatePresence, motion } from "motion/react";
import { useViz } from "@/lib/store";
import { computeStats } from "@/lib/graph";

// The decade as authored beats, keyed to Zcash network upgrades.
const CHAPTERS: { ym: string; title: string; text: string }[] = [
  { ym: "2015-12", title: "Genesis", text: "Late 2015, a handful of cryptographers begin the Zcash codebase." },
  { ym: "2016-10", title: "Sprout · mainnet", text: "Oct 2016, Zcash launches. The founding core is tiny and tightly knit." },
  { ym: "2018-10", title: "Sapling", text: "2018, Sapling makes shielded transactions practical; the contributor base widens." },
  { ym: "2020-07", title: "Heartwood → Canopy", text: "2020, upgrades land back to back as the ecosystem matures." },
  { ym: "2022-05", title: "NU5 · Orchard", text: "2022, Orchard & unified addresses. New teams join; collaboration deepens." },
  { ym: "2024-11", title: "NU6", text: "2024, the network keeps shipping. The graph is now dense with ties." },
  { ym: "2026-07", title: "Ironwood", text: "2026, ten years, {people} people, one shielded ecosystem." },
];

export default function StoryCaption() {
  const { data, month, story, mode, windowSize, minWeight, showBots, set, setMonth } = useViz();
  if (!data || !story) return null;

  const months = data.meta.months;
  let ch = CHAPTERS[0], idx = 0;
  CHAPTERS.forEach((c, i) => {
    const mi = months.indexOf(c.ym);
    if (mi >= 0 && mi <= month) { ch = c; idx = i; }
  });

  // same count the People stat shows, so the caption can't drift from the data
  const people = computeStats(data, month, mode, windowSize, minWeight, showBots).people;

  const skip = () => {
    set("playing", false);
    set("story", false);
    set("minWeight", useViz.getState().cleanMinWeight); // declutter to the clean explore view
    setMonth(months.length - 1);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[13%] z-30 flex justify-center px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="glass pointer-events-auto max-w-sm rounded-2xl px-6 py-4 text-center"
        >
          <div className="label mb-1.5 text-gold/80" style={{ letterSpacing: "0.2em" }}>{ch.title}</div>
          <p className="font-display text-[15px] leading-snug text-foreground/90 text-balance">{ch.text.replace("{people}", String(people))}</p>
          <button onClick={skip} className="label mt-3 text-foreground/45 transition-colors hover:text-gold">
            Skip → explore the network
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
