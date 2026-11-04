"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useViz } from "@/lib/store";
import { MILESTONES, prettyMonth } from "@/lib/graph";
import { Segmented } from "./Segmented";

export default function Timeline() {
  const { data, month, mode, windowSize, playing, set, setMonth, togglePlay } = useViz();
  const trackRef = useRef<HTMLDivElement>(null);

  // playback
  useEffect(() => {
    if (!playing || !data) return;
    const n = data.meta.n_months;
    if (month >= n - 1) setMonth(0);
    const id = setInterval(() => {
      const st = useViz.getState();
      if (st.month >= n - 1) {
        set("playing", false);
        // the story ends where exploration begins: reveal the clean network,
        // the leaderboard rail, and the full control surface
        if (st.story) { set("story", false); set("minWeight", st.cleanMinWeight); }
        return;
      }
      setMonth(st.month + 1);
    }, 360);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, data]);

  if (!data) return null;
  const months = data.meta.months;
  const n = months.length;
  const cm = data.meta.commits_monthly;
  const max = Math.max(...cm, 1);
  const pm = prettyMonth(months, month);

  const scrub = (clientX: number) => {
    const el = trackRef.current!;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setMonth(Math.round(frac * (n - 1)));
  };

  return (
    <div className="glass pointer-events-auto flex items-center gap-3 px-3 py-2.5 sm:gap-5 sm:px-5 sm:py-3">
      {/* play */}
      <motion.button
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="grid size-11 flex-none place-items-center rounded-full text-[12px] sm:text-[13px]"
        style={{
          background: playing ? "var(--secondary)" : "radial-gradient(circle at 36% 30%, #ffd469, var(--gold))",
          color: playing ? "var(--foreground)" : "#241a00",
          boxShadow: playing ? "none" : "0 4px 18px -4px rgba(244,183,40,0.55)",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={playing ? "pause" : "play"}
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15 }}>
            {playing ? "❚❚" : "▶"}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* month + milestone pill */}
      <div className="flex w-auto flex-none items-center gap-3 sm:w-[190px]">
        <div className="font-display tnum text-[14px] leading-none sm:text-[15px]">
          <span className="text-foreground/55">{pm.year}</span> <span className="font-semibold text-gold">{pm.month}</span>
        </div>
      </div>

      {/* track */}
      <div className="relative flex-1">
        {/* milestone labels, hidden on small screens (they'd collide) */}
        <div className="pointer-events-none absolute -top-2 left-0 hidden h-6 w-full sm:block">
          {MILESTONES.map(([ym, name], i) => {
            const idx = months.indexOf(ym);
            if (idx < 0) return null;
            return (
              <span
                key={ym}
                className="label absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${(idx / (n - 1)) * 100}%`, top: i % 2 ? 11 : 0, fontSize: "8px", color: "var(--muted-foreground)" }}
              >
                {name}
              </span>
            );
          })}
        </div>

        {/* histogram + scrub */}
        <div
          ref={trackRef}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); scrub(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons === 1) scrub(e.clientX); }}
          className="relative mt-5 flex h-8 cursor-pointer items-end gap-px"
        >
          {cm.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${Math.max(4, Math.sqrt(v / max) * 100)}%`,
                background: i <= month ? "var(--gold)" : "rgba(244,183,40,0.18)",
              }}
            />
          ))}
          {/* milestone ticks */}
          {MILESTONES.map(([ym]) => {
            const idx = months.indexOf(ym);
            if (idx < 0) return null;
            return <div key={ym} className="absolute bottom-0 h-full w-px" style={{ left: `${(idx / (n - 1)) * 100}%`, background: "var(--grid-line)" }} />;
          })}
          {/* playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-gold" style={{ left: `${(month / (n - 1)) * 100}%` }}>
            <div className="absolute -top-1 -left-[3px] size-[7px] rounded-full bg-gold" />
          </div>
        </div>
      </div>

      {/* mode */}
      <div className="flex flex-none items-center gap-3">
        {mode === "window" && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <input
              type="range" min={3} max={36} step={1} value={windowSize}
              onChange={(e) => set("windowSize", +e.target.value)}
              className="w-16 accent-[var(--gold)]"
            />
            <span className="mono tnum text-[10px] text-gold">{windowSize}mo</span>
          </div>
        )}
        <Segmented
          value={mode}
          onChange={(v) => set("mode", v)}
          options={[{ value: "cumulative", label: "Cumulative" }, { value: "window", label: "Window" }]}
        />
      </div>
    </div>
  );
}
