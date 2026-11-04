"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useViz } from "@/lib/store";
import { computeStats } from "@/lib/graph";

// smoothly tween a displayed number toward its target (easeOutCubic)
function useCountUp(target: number, duration = 400) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Stat({ label, value, format, className = "" }: { label: string; value: number; format: (n: number) => string; className?: string }) {
  const shown = useCountUp(value);
  return (
    <div className={`flex flex-col gap-0.5 px-2.5 sm:px-3.5 ${className}`}>
      <span className="label">{label}</span>
      <span className="font-display tnum text-[16px] leading-none font-semibold text-foreground sm:text-[19px]">{format(shown)}</span>
    </div>
  );
}

function Growth() {
  const data = useViz((s) => s.data);
  const month = useViz((s) => s.month);
  if (!data) return null;
  const series = data.timeline.map((t) => t.nodes);
  const W = 74, H = 26, max = Math.max(...series, 1);
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  const path = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="hidden flex-col gap-1 px-3.5 lg:flex">
      <span className="label">Growth</span>
      <svg width={W} height={H} className="overflow-visible">
        <path d={path} fill="none" stroke="var(--gold)" strokeWidth={1.5} />
        <circle cx={x(month)} cy={y(series[month])} r={2.4} fill="var(--gold)"
          style={{ transition: "cx 0.3s ease-out, cy 0.3s ease-out" }} />
      </svg>
    </div>
  );
}

export default function StatsBar() {
  const { data, month, mode, windowSize, minWeight, showBots, story, allTies } = useViz();
  const s = useMemo(
    () => (data ? computeStats(data, month, mode, windowSize, minWeight, showBots, !story && !allTies) : null),
    [data, month, mode, windowSize, minWeight, showBots, story, allTies]
  );
  if (!s) return null;
  const int = (n: number) => Math.round(n).toLocaleString("en-US");
  return (
    <div className="glass pointer-events-auto flex items-stretch divide-x divide-white/[0.06] py-2 sm:py-2.5">
      <Stat label="People" value={s.people} format={int} />
      <Stat label="Ties" value={s.ties} format={int} />
      <Stat label="Commits" value={s.commits} format={int} />
      <Stat label="Density" value={s.density * 100} format={(n) => `${n.toFixed(1)}%`} className="hidden sm:flex" />
      <Growth />
    </div>
  );
}
