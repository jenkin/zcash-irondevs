"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useViz } from "@/lib/store";
import GraphCanvas from "@/components/GraphCanvas";
import StatsBar from "@/components/StatsBar";
import ControlPanel from "@/components/ControlPanel";
import Timeline from "@/components/Timeline";
import Tooltip from "@/components/Tooltip";
import StoryCaption from "@/components/StoryCaption";
import SelectionCard from "@/components/SelectionCard";
import Leaderboard from "@/components/Leaderboard";
import ThemeToggle from "@/components/ThemeToggle";

// cinematic rise-and-unblur, spring-settled
const rise = (dir: "left" | "top" | "bottom", delay: number) => ({
  initial: { opacity: 0, filter: "blur(7px)", ...(dir === "left" ? { x: -26 } : { y: dir === "top" ? -22 : 30 }) },
  animate: { opacity: 1, filter: "blur(0px)", x: 0, y: 0 },
  transition: { type: "spring" as const, stiffness: 90, damping: 17, delay },
});

function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2.2" fill="var(--canvas)" />
      <line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2.2" fill="var(--canvas)" />
    </svg>
  );
}

export default function Home() {
  const load = useViz((s) => s.load);
  const data = useViz((s) => s.data);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => { load(); }, [load]);

  return (
    // reducedMotion="user": every Framer entrance/spring collapses to a fade
    // when the OS asks for less motion
    <MotionConfig reducedMotion="user">
    <main className="relative h-full w-full overflow-hidden bg-canvas">
      {/* ambient navy + gold glow */}
      <div className="ambient breathe pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0 z-40 opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* graph fills the stage */}
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, ease: "easeOut" }}>
        {data ? <GraphCanvas /> : <Loading />}
      </motion.div>

      {/* floating chrome */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          {/* desktop: inline control panel · mobile: a toggle button */}
          <motion.div className="hidden md:block" {...rise("left", 0.15)}>
            <ControlPanel />
          </motion.div>
          <motion.button
            className="glass pointer-events-auto grid size-11 place-items-center rounded-xl text-gold md:hidden"
            onClick={() => setPanelOpen(true)}
            aria-label="Open controls"
            {...rise("left", 0.15)}
          >
            <SlidersIcon />
          </motion.button>

          <div className="flex items-start gap-2 sm:gap-3">
            <motion.div {...rise("top", 0.3)}><ThemeToggle /></motion.div>
            <motion.div {...rise("top", 0.36)}><StatsBar /></motion.div>
          </div>
        </div>

        <div className="flex justify-center">
          <motion.div className="pointer-events-auto w-full max-w-[1180px]" {...rise("bottom", 0.45)}>
            <Timeline />
          </motion.div>
        </div>
      </div>

      {/* mobile control drawer */}
      <AnimatePresence>
        {panelOpen && (
          <div className="md:hidden">
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              className="fixed left-0 top-0 bottom-0 z-50 w-[min(88vw,320px)] p-3"
              initial={{ x: -340 }} animate={{ x: 0 }} exit={{ x: -340 }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
            >
              <ControlPanel onClose={() => setPanelOpen(false)} className="h-full" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Leaderboard />
      <SelectionCard />
      <StoryCaption />
      <Tooltip />
    </main>
    </MotionConfig>
  );
}

function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <span className="label animate-pulse">Loading the decade…</span>
    </div>
  );
}
