"use client";

import { useEffect, useRef } from "react";
import type { GraphData, Snapshot, SnapshotNode } from "@/lib/graph-types";
import { colorForCommunity, labelCommunities, layoutSnapshot, nodeRadius } from "@/lib/layout";

interface LivePos {
  x: number;
  y: number;
  a: number; // alpha, animates 0 to 1
  tx: number;
  ty: number;
  ta: number;
  rad: number;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

export interface HoverInfo {
  id: string;
  node: SnapshotNode;
  x: number;
  y: number;
}

interface Props {
  snapshot: Snapshot | null;
  identities: GraphData["identities"];
  selectedId: string | null;
  query: string;
  showHulls: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (id: string | null) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 6;

export default function GraphCanvas({ snapshot, identities, selectedId, query, showHulls, onHover, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Map<string, LivePos>>(new Map());
  const rafRef = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const identitiesRef = useRef(identities);
  const selectedRef = useRef(selectedId);
  const queryRef = useRef(query);
  const showHullsRef = useRef(showHulls);
  const hoverIdRef = useRef<string | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const avatarCache = useRef<Map<string, HTMLImageElement | "error">>(new Map());

  useEffect(() => {
    snapshotRef.current = snapshot;
    identitiesRef.current = identities;
    selectedRef.current = selectedId;
    queryRef.current = query;
    showHullsRef.current = showHulls;
    // A state change (checkpoint, selection, search) must be visible even in
    // hosting contexts that throttle or withhold requestAnimationFrame
    // (backgrounded/headless tabs): draw once synchronously here so the
    // frame is never solely dependent on the animation loop below.
    drawRef.current();
  }, [snapshot, identities, selectedId, query, showHulls]);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  }, [onSelect, onHover]);

  // Backing-store sizing lives in its own ResizeObserver, not the rAF loop:
  // an element can resize (and needs its canvas backing store resized)
  // without a paint ever being requested.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      drawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  function getAvatar(login: string): HTMLImageElement | null {
    const cached = avatarCache.current.get(login);
    if (cached === "error") return null;
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
    const img = new Image();
    // No crossOrigin: GitHub's avatar redirect doesn't reliably serve CORS
    // headers, and drawing here never reads pixels back (no getImageData /
    // toDataURL on this canvas), so there's nothing an anonymous-CORS
    // failure would protect against -- only something it would break.
    img.onload = () => drawRef.current();
    img.onerror = () => avatarCache.current.set(login, "error");
    img.src = `https://github.com/${login}.png?size=64`;
    avatarCache.current.set(login, img);
    return null;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const cv = canvasRef.current;
      const snap = snapshotRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w === 0 || h === 0) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!snap) return;

      const laid = layoutSnapshot(snap.nodes, w, h);
      const laidById = new Map(laid.map((n) => [n.id, n]));
      const positions = posRef.current;

      // fade out nodes no longer present this checkpoint, keep their last
      // known position so they shrink in place instead of jumping away
      for (const [id, p] of positions) {
        if (!laidById.has(id)) p.ta = 0;
      }
      for (const n of laid) {
        let p = positions.get(n.id);
        if (!p) {
          p = { x: n.tx, y: n.ty, a: 0, tx: n.tx, ty: n.ty, ta: 1, rad: nodeRadius(n.degree) };
          positions.set(n.id, p);
        }
        p.tx = n.tx;
        p.ty = n.ty;
        p.ta = 1;
        p.rad = nodeRadius(n.degree);
      }
      for (const p of positions.values()) {
        p.x += (p.tx - p.x) * 0.09;
        p.y += (p.ty - p.y) * 0.09;
        p.a += (p.ta - p.a) * 0.12;
      }

      const sel = selectedRef.current;
      const q = queryRef.current.trim().toLowerCase();
      let emph: Set<string> | null = null;
      if (sel) {
        emph = new Set([sel]);
        for (const e of snap.edges) {
          if (e.source === sel) emph.add(e.target);
          if (e.target === sel) emph.add(e.source);
        }
      } else if (q.length >= 2) {
        emph = new Set();
        for (const n of snap.nodes) {
          if (n.name.toLowerCase().includes(q)) emph.add(n.id);
        }
      }

      const view = viewRef.current;
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);

      // edges
      const byId = new Map(snap.nodes.map((n) => [n.id, n]));
      for (const e of snap.edges) {
        const pa = positions.get(e.source);
        const pb = positions.get(e.target);
        if (!pa || !pb) continue;
        const aa = Math.min(pa.a, pb.a);
        if (aa < 0.03) continue;
        // Kept light on purpose: these lines sit directly behind the avatar
        // circles, and anything darker starts to compete with the faces
        // drawn on top of them, especially where many edges converge near a
        // busy node.
        let al = Math.min(0.13, 0.03 + 0.06 * Math.min(e.weight / 40, 1.4)) * aa;
        let lw = 0.7;
        if (emph) {
          if (emph.has(e.source) && emph.has(e.target)) {
            al = Math.max(al, 0.22);
            lw = 0.9;
          } else {
            al *= 0.15;
          }
        }
        ctx.strokeStyle = `rgba(32,31,29,${al.toFixed(3)})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // community hulls: shown only alongside the Chapters panel, since
      // that's where the community-event narrative gives the grouping
      // meaning. Labeled from real data (each community's members' most
      // common top repo), not a fixed or invented name.
      if (showHullsRef.current) {
        const byCommunity = new Map<number, { id: string; p: LivePos }[]>();
        for (const [id, p] of positions) {
          if (p.a < 0.4) continue;
          const node = byId.get(id);
          if (!node || node.community < 0) continue;
          const list = byCommunity.get(node.community) ?? [];
          list.push({ id, p });
          byCommunity.set(node.community, list);
        }
        const nodesByCommunity = new Map<number, SnapshotNode[]>(
          [...byCommunity.entries()].map(([commId, members]) => [
            commId,
            members.map(({ id }) => byId.get(id)!).filter(Boolean),
          ]),
        );
        const labels = labelCommunities(nodesByCommunity);
        for (const [commId, members] of byCommunity) {
          if (members.length < 4) continue;
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const { p } of members) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const rx = (maxX - minX) / 2 + 26;
          const ry = (maxY - minY) / 2 + 24;
          const color = colorForCommunity(commId);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(rx, 10), Math.max(ry, 10), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          const label = labels.get(commId) ?? `Community ${commId + 1}`;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = color;
          ctx.font = "10px var(--font-lora), Lora, serif";
          ctx.textAlign = "center";
          ctx.fillText(label, cx, cy - ry - 9);
          ctx.textAlign = "left";
          ctx.globalAlpha = 1;
        }
      }

      // nodes: a real GitHub avatar clipped into the circle when we have
      // genuine evidence of the contributor's login (see identity.py's
      // github_login), otherwise the plain community-colored ring -- never a
      // fabricated image.
      const sorted = [...positions.entries()].sort((a, b) => (byId.get(b[0])?.degree ?? 0) - (byId.get(a[0])?.degree ?? 0));
      for (const [id, p] of positions) {
        if (p.a < 0.03) continue;
        const node = byId.get(id);
        const dim = emph && !emph.has(id);
        const alpha = p.a * (dim ? 0.25 : 1);
        const login = identitiesRef.current[id]?.githubLogin ?? null;
        const avatar = login ? getAvatar(login) : null;

        ctx.globalAlpha = alpha;
        if (avatar) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(avatar, p.x - p.rad, p.y - p.rad, p.rad * 2, p.rad * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = "#f3f2f2";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = node ? colorForCommunity(node.community) : "#9b9797";
        ctx.lineWidth = p.rad > 5 ? 1.6 : 1.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
        ctx.stroke();

        const ring = id === sel || (!sel && emph && emph.has(id)) || id === hoverIdRef.current;
        if (ring) {
          ctx.strokeStyle = "#b68235";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.rad + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // labels: top 12 by degree currently visible (or within emphasis)
      const labeled = sorted.filter(([id, p]) => p.a > 0.4 && (!emph || emph.has(id))).slice(0, 12);
      for (const [id, p] of labeled) {
        const node = byId.get(id);
        if (!node) continue;
        const strong = id === sel;
        ctx.font = `${strong ? "600 " : ""}12px var(--font-lora), Lora, serif`;
        ctx.fillStyle = `rgba(32,31,29,${strong ? 0.92 : 0.7})`;
        ctx.fillText(node.name, p.x + p.rad + 7, p.y + 4);
      }

      ctx.restore();
    };

    drawRef.current = draw;
    draw(); // guarantee a first paint even where rAF is throttled/withheld
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      draw();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Zoom (wheel + pinch) and pan (drag), plus tap/click-to-select, are all
  // handled through native pointer events rather than React's synthetic
  // mouse handlers: multi-touch pinch needs a live map of every active
  // pointer, which React's per-element handlers don't give you directly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function screenToWorld(sx: number, sy: number) {
      const view = viewRef.current;
      return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
    }

    function hitTestWorld(wx: number, wy: number): { id: string; sx: number; sy: number } | null {
      const view = viewRef.current;
      let best: { id: string; sx: number; sy: number } | null = null;
      let bd = Infinity;
      for (const [id, p] of posRef.current) {
        if (p.a < 0.3) continue;
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (d < p.rad + 6 && d < bd) {
          best = { id, sx: p.x * view.scale + view.x, sy: p.y * view.scale + view.y };
          bd = d;
        }
      }
      return best;
    }

    const pointers = new Map<number, { x: number; y: number }>();
    let dragMoved = false;
    let panStart: { x: number; y: number; viewX: number; viewY: number } | null = null;
    let pinchStart: { dist: number; scale: number; midX: number; midY: number; viewX: number; viewY: number } | null = null;

    function updateCursorAndHover(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const world = screenToWorld(clientX - rect.left, clientY - rect.top);
      const hit = hitTestWorld(world.x, world.y);
      canvas!.style.cursor = hit ? "pointer" : "grab";
      const id = hit ? hit.id : null;
      if (id !== hoverIdRef.current) {
        hoverIdRef.current = id;
        if (hit && snapshotRef.current) {
          const node = snapshotRef.current.nodes.find((n) => n.id === hit.id);
          if (node) onHoverRef.current({ id: hit.id, node, x: hit.sx, y: hit.sy });
          else onHoverRef.current(null);
        } else {
          onHoverRef.current(null);
        }
        drawRef.current();
      }
    }

    function onPointerDown(e: PointerEvent) {
      try {
        canvas!.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that's already gone by the time capture is requested
        // (rare, but not impossible depending on the browser/embedding) must
        // not break panning/selection for the rest of this gesture.
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragMoved = false;
      const view = viewRef.current;
      if (pointers.size === 1) {
        panStart = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y };
        pinchStart = null;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, viewX: view.x, viewY: view.y };
        panStart = null;
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") updateCursorAndHover(e.clientX, e.clientY);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const view = viewRef.current;
      const rect = canvas!.getBoundingClientRect();

      if (pointers.size === 1 && panStart) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        if (Math.hypot(dx, dy) > 4) dragMoved = true;
        view.x = panStart.viewX + dx;
        view.y = panStart.viewY + dy;
        drawRef.current();
      } else if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const newScale = clamp(pinchStart.scale * (dist / pinchStart.dist), MIN_SCALE, MAX_SCALE);
        const anchorSx = pinchStart.midX - rect.left;
        const anchorSy = pinchStart.midY - rect.top;
        const worldX = (anchorSx - pinchStart.viewX) / pinchStart.scale;
        const worldY = (anchorSy - pinchStart.viewY) / pinchStart.scale;
        view.scale = newScale;
        view.x = midX - rect.left - worldX * newScale;
        view.y = midY - rect.top - worldY * newScale;
        dragMoved = true;
        drawRef.current();
      }
    }

    function endPointer(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      const view = viewRef.current;
      if (pointers.size === 0) {
        if (!dragMoved) {
          const rect = canvas!.getBoundingClientRect();
          const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
          const hit = hitTestWorld(world.x, world.y);
          onSelectRef.current(hit ? hit.id : null);
        }
        panStart = null;
        pinchStart = null;
      } else if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        panStart = { x: p.x, y: p.y, viewX: view.x, viewY: view.y };
        pinchStart = null;
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const view = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const newScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (sx - view.x) / view.scale;
      const worldY = (sy - view.y) / view.scale;
      view.scale = newScale;
      view.x = sx - worldX * newScale;
      view.y = sy - worldY * newScale;
      drawRef.current();
    }

    function onDoubleClick() {
      viewRef.current = { scale: 1, x: 0, y: 0 };
      drawRef.current();
    }

    function onPointerLeave() {
      if (pointers.size === 0) {
        hoverIdRef.current = null;
        onHoverRef.current(null);
        drawRef.current();
      }
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab" style={{ touchAction: "none" }} />;
}
