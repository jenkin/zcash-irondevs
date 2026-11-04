"use client";

import { useEffect, useState } from "react";
import { useViz } from "@/lib/store";
import { buildColorModel, linkWeight, nodeCommits } from "@/lib/graph";

export default function Tooltip() {
  const { data, hovered, month, mode, windowSize, minWeight, colorBy } = useViz();
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (!data || !hovered) return null;
  const n = data.nodes.find((x) => x.id === hovered);
  if (!n) return null;

  let ties = 0;
  for (const l of data.links) {
    // use the frozen id copies, d3-force mutates l.source/l.target into node objects
    if ((l.s ?? l.source) !== n.id && (l.t ?? l.target) !== n.id) continue;
    if (linkWeight(l, month, mode, windowSize) >= minWeight) ties++;
  }
  const color = buildColorModel(data.nodes, colorBy).color(n);
  const commits = nodeCommits(n, month, mode, windowSize);

  const flip = pos.x > window.innerWidth - 280;
  const style: React.CSSProperties = {
    left: flip ? pos.x - 264 : pos.x + 16,
    top: Math.min(pos.y + 16, window.innerHeight - 150),
  };

  return (
    <div className="glass pointer-events-none fixed z-50 w-[248px] p-3" style={style}>
      <div className="flex items-center gap-2.5">
        {n.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- static local avatar, next/image adds no value in static export
          <img src={n.avatar} alt="" className="size-9 flex-none rounded-full object-cover" style={{ border: `1.5px solid ${color}` }} />
        ) : (
          <span className="size-9 flex-none rounded-full" style={{ background: color }} />
        )}
        <div className="min-w-0">
          <div className="font-display truncate text-[13.5px] font-semibold">{n.name}</div>
          <div className="label mt-0.5 truncate" style={{ letterSpacing: "0.06em" }}>
            {n.org}{n.is_bot ? " · bot" : ""}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex gap-4">
        <span className="mono text-[11px] text-foreground/60"><b className="text-gold">{commits.toLocaleString()}</b> commits</span>
        <span className="mono text-[11px] text-foreground/60"><b className="text-gold">{ties}</b> ties</span>
      </div>
      <div className="mono mt-2 text-[10px] leading-relaxed text-foreground/40">{n.repos.join(" · ")}</div>
    </div>
  );
}
