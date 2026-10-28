"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useViz } from "@/lib/store";
import { buildColorModel } from "@/lib/graph";
import { Slider } from "@/components/ui/slider";
import { Segmented } from "./Segmented";

const num = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

export default function ControlPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const { data, colorBy, sizeBy, sizeScale, minWeight, showBots, allTies, set } = useViz();
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(0); // keyboard-highlighted search result
  // desktop opens minimal (masthead + search); the drawer opens with tools shown
  const [open, setOpen] = useState(!!onClose);

  const clusters = useMemo(
    () => (data ? buildColorModel(data.nodes, colorBy).clusters : []),
    [data, colorBy]
  );
  const maxWeight = useMemo(
    () => (data ? Math.min(40, Math.max(8, Math.max(...data.links.map((l) => l.weight)))) : 20),
    [data]
  );
  const hits = useMemo(() => {
    if (!data || !q.trim()) return [];
    const s = q.trim().toLowerCase();
    return data.nodes.filter((n) => n.name.toLowerCase().includes(s)).slice(0, 6);
  }, [data, q]);

  if (!data) return null;

  // jump to a searched person: leave the story, show the full network, focus them
  const focus = (id: string) => {
    const st = useViz.getState();
    set("story", false);
    set("playing", false);
    set("minWeight", st.cleanMinWeight);
    st.setMonth(data.meta.n_months - 1);
    set("selected", id);
    setQ("");
  };

  return (
    <div className={`glass pointer-events-auto relative flex w-full max-w-[288px] flex-col gap-[18px] overflow-y-auto p-4 pl-5 md:w-[272px] md:max-h-[calc(100dvh-2rem)] ${className || ""}`}>
      {/* signature: a thin gold accent down the left edge */}
      <span className="absolute left-0 top-5 bottom-5 w-[2px] rounded-full bg-gradient-to-b from-gold/70 via-gold/25 to-transparent" />

      {/* close button (mobile drawer only) */}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close controls"
          className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-md text-foreground/50 hover:bg-white/[0.06] hover:text-foreground sm:size-7"
        >
          ✕
        </button>
      )}

      {/* editorial masthead */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-gold" style={{ filter: "drop-shadow(0 0 8px var(--gold))" }}>◈</span>
          <span className="label text-gold/70" style={{ letterSpacing: "0.24em" }}>Ironwood Almanac</span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-[0.92] tracking-[-0.03em]">
          Ten Years<br />of Zcash
        </h1>
        <p className="mono mt-2 text-[10.5px] text-foreground/45">
          A co-authorship network · {data.meta.months[0]?.replace("-", ".")} → {data.meta.months.at(-1)?.replace("-", ".")}
        </p>
        <div className="mt-3 h-px w-full bg-gradient-to-r from-white/12 to-transparent" />
      </div>

      {/* search */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setHit(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setHit((h) => (h + 1) % hits.length); }
            if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setHit((h) => (h - 1 + hits.length) % hits.length); }
            if (e.key === "Enter" && hits.length) { focus(hits[Math.min(hit, hits.length - 1)].id); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") setQ("");
          }}
          placeholder="Search contributors"
          className="search-input mono w-full rounded-lg px-3 py-2 text-[12px] text-foreground outline-none"
        />
        {hits.length > 0 && (
          <div className="glass absolute top-full left-0 right-0 z-20 mt-1.5 flex flex-col gap-0.5 p-1" role="listbox">
            {hits.map((n, i) => (
              <button
                key={n.id}
                role="option"
                aria-selected={i === hit}
                onMouseEnter={() => setHit(i)}
                onClick={() => focus(n.id)}
                className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px]"
                style={i === hit ? { background: "var(--accent)", color: "var(--foreground)" } : { color: "var(--muted-foreground)" }}
              >
                <span className="truncate">{n.name}</span>
                <span className="mono tnum" style={{ opacity: 0.6 }}>{n.commits.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* controls toggle: keeps the resting panel to masthead + search */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="label">{open ? "Hide controls" : "Controls & legend"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="text-[11px] text-gold">
          ⌄
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col gap-[18px] pt-1">
              {/* color by */}
              <div className="flex flex-col gap-2">
                <span className="label">Color by</span>
                <Segmented
                  value={colorBy}
                  onChange={(v) => set("colorBy", v)}
                  options={[{ value: "community", label: "Cluster" }, { value: "org", label: "Org" }]}
                />
              </div>

              {/* node size */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="label">Node size</span>
                  <span className="mono tnum text-[11px] text-gold">{sizeScale.toFixed(2)}×</span>
                </div>
                <Slider min={0.5} max={2} step={0.25} value={[sizeScale]} onValueChange={(v) => set("sizeScale", num(v))} />
              </div>

              {/* size by which metric */}
              <div className="flex flex-col gap-2">
                <span className="label">Size by</span>
                <Segmented
                  value={sizeBy}
                  onChange={(v) => set("sizeBy", v)}
                  options={[{ value: "commits", label: "Commits" }, { value: "degree", label: "Ties" }, { value: "betweenness", label: "Bridging" }]}
                />
              </div>

              {/* min tie strength */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="label">Min tie strength</span>
                  <span className="mono tnum text-[11px] text-gold">{minWeight}</span>
                </div>
                <Slider min={1} max={maxWeight} step={1} value={[minWeight]} onValueChange={(v) => set("minWeight", num(v))} />
              </div>

              {/* thin to each person's strongest ties vs draw every tie */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox" checked={allTies}
                  onChange={(e) => set("allTies", e.target.checked)}
                  className="size-3.5 accent-[var(--gold)]"
                />
                <span className="label">Show all ties</span>
              </label>

              {/* show bots */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox" checked={showBots}
                  onChange={(e) => set("showBots", e.target.checked)}
                  className="size-3.5 accent-[var(--gold)]"
                />
                <span className="label">Show bots &amp; automation</span>
              </label>

              {/* clusters */}
              <div className="flex flex-col gap-2">
                <span className="label">{colorBy === "community" ? "Clusters" : "Organizations"}</span>
                <div className="flex flex-col gap-1.5">
                  {clusters.map((c) => (
                    <div key={String(c.key)} className="flex items-center gap-2.5 text-[12px]">
                      <span className="size-2.5 flex-none rounded-[3px]" style={{ background: c.color, boxShadow: `0 0 8px -2px ${c.color}` }} />
                      <span className="truncate text-foreground/80">{c.label}</span>
                      <span className="mono tnum ml-auto text-foreground/40">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
