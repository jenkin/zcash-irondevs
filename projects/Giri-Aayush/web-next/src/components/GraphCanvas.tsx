"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useViz } from "@/lib/store";
import {
  buildColorModel,
  linkWeight,
  nodeCommits,
  type GLink,
  type GNode,
} from "@/lib/graph";

type Sel<E extends d3.BaseType> = d3.Selection<E, unknown, null, undefined>;
type Refs = {
  svg: Sel<SVGSVGElement>;
  defs: Sel<SVGDefsElement>;
  zoomG: Sel<SVGGElement>;
  gLink: Sel<SVGGElement>;
  gNode: Sel<SVGGElement>;
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  byId: Map<string, GNode>;
  patterns: Set<string>;
  dragging: Set<string>; // node ids mid-gesture, so stale pins can be cleared
  dragB: d3.DragBehavior<SVGGElement, GNode, GNode | d3.SubjectPosition>;
  didFit?: boolean;
  fitView?: (d?: number) => void;
};

export default function GraphCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const sim = useRef<d3.Simulation<GNode, GLink> | null>(null);
  const refs = useRef<Refs>({} as Refs);

  const {
    data, month, mode, windowSize, colorBy, sizeBy, sizeScale, minWeight, showBots, selected, story,
  } = useViz();

  // ── one-time setup ──
  useEffect(() => {
    if (!svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const rect = svgRef.current.getBoundingClientRect();
    svg.attr("viewBox", `0 0 ${rect.width} ${rect.height}`);

    const defs = svg.append("defs");
    // reusable glossy sheen (white top-left highlight) for sphere bubbles
    const sheen = defs.append("radialGradient").attr("id", "sheen").attr("cx", "34%").attr("cy", "28%").attr("r", "62%");
    sheen.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff").attr("stop-opacity", 0.5);
    sheen.append("stop").attr("offset", "100%").attr("stop-color", "#ffffff").attr("stop-opacity", 0);
    // muted navy "background sea" bubble
    const mut = defs.append("radialGradient").attr("id", "muted").attr("cx", "36%").attr("cy", "30%").attr("r", "75%");
    mut.append("stop").attr("offset", "0%").attr("stop-color", "#28324c");
    mut.append("stop").attr("offset", "60%").attr("stop-color", "#151b2b");
    mut.append("stop").attr("offset", "100%").attr("stop-color", "#0b1019");
    // arrowhead for strong ties
    const marker = defs.append("marker").attr("id", "arrow").attr("viewBox", "0 0 10 10")
      .attr("refX", 8).attr("refY", 5).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto");
    marker.append("path").attr("d", "M0,1 L9,5 L0,9").attr("fill", "none").attr("stroke", "#8792b5").attr("stroke-width", 1.4);
    const zoomG = svg.append("g");
    const gLink = zoomG.append("g").attr("stroke", "#4a5573");
    const gNode = zoomG.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 6])
      .on("zoom", (e) => zoomG.attr("transform", e.transform));
    svg.call(zoom as any);

    const byId = new Map<string, GNode>(data.nodes.map((n) => [n.id, n]));

    // a phone canvas is tiny: damp harder and pull weaker so a drag can't
    // slingshot the whole network across the viewport
    const compact = rect.width < 640;
    const simulation = d3
      .forceSimulation<GNode, GLink>()
      .alphaDecay(compact ? 0.05 : 0.038) // let motion carry a touch longer so it settles with spring
      .velocityDecay(compact ? 0.62 : 0.46) // lighter damping = more bounce; distanceMax caps still tame the spiral
      .force("charge", d3.forceManyBody().strength(compact ? -260 : -430).distanceMax(compact ? 280 : 420))
      .force("link", d3.forceLink<GNode, GLink>().id((d: any) => d.id)
        .distance((l: any) => (compact ? 76 : 100) / Math.sqrt(l.w || 1)).strength(compact ? 0.22 : 0.34)
        .iterations(2)) // tight, springy ties; 2 passes converge instead of oscillating
      .force("center", d3.forceCenter(rect.width / 2, rect.height / 2))
      .force("collide", d3.forceCollide<GNode>().radius((d) => (d.r || 4) + (compact ? 8 : 12)).strength(0.8).iterations(2))
      .force("x", d3.forceX(rect.width / 2).strength(compact ? 0.05 : 0.03))
      .force("y", d3.forceY(rect.height / 2).strength(compact ? 0.05 : 0.03))
      .on("tick", () => {
        gLink.selectAll<SVGLineElement, GLink>("line").each(function (l) {
          const a = byId.get(l.s!)!, b = byId.get(l.t!)!;
          const dx = b.x! - a.x!, dy = b.y! - a.y!, len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const line = this as SVGLineElement;
          line.setAttribute("x1", String(a.x! + ux * ((a.r || 4) + 2)));
          line.setAttribute("y1", String(a.y! + uy * ((a.r || 4) + 2)));
          line.setAttribute("x2", String(b.x! - ux * ((b.r || 4) + 7)));
          line.setAttribute("y2", String(b.y! - uy * ((b.r || 4) + 7)));
        });
        gNode.selectAll<SVGGElement, GNode>("g.node").attr("transform", (n) => `translate(${n.x},${n.y})`);
        // fit once the layout has actually settled (not mid-explosion)
        if (!refs.current.didFit && simulation.alpha() < 0.06) {
          refs.current.didFit = true;
          fitView(600);
        }
      });
    sim.current = simulation;

    refs.current = {
      svg, defs, zoomG, gLink, gNode, zoom, byId,
      patterns: new Set<string>(),
      dragging: new Set<string>(),
      // ONE shared drag behavior: d3-drag's gesture registry (e.active) only
      // coordinates within a single instance, so per-enter-batch instances
      // would break multi-touch damping restore
      dragB: null as unknown as Refs["dragB"],
    };
    refs.current.dragB = makeDrag();

    let resizeT: ReturnType<typeof setTimeout>;
    const onResize = () => {
      const r = svgRef.current!.getBoundingClientRect();
      svg.attr("viewBox", `0 0 ${r.width} ${r.height}`);
      simulation.force("center", d3.forceCenter(r.width / 2, r.height / 2));
      simulation.alpha(0.2).restart();
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        // a selection recenter must win over the resize re-frame (mobile keyboard open/close)
        const sel = useViz.getState().selected;
        if (sel) recenter(sel); else fitView(500);
      }, 260); // re-frame after the layout re-settles
    };
    window.addEventListener("resize", onResize);

    update();
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeT);
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── react to control changes ──
  useEffect(() => {
    if (!sim.current) return;
    update();
    // keep the growing network framed as the story auto-plays through the decade
    const st = useViz.getState();
    const last = (data?.meta.n_months ?? 1) - 1;
    if (st.playing && (month % 12 === 0 || month === last)) {
      const t = setTimeout(() => refs.current.fitView?.(750), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, mode, windowSize, colorBy, sizeBy, sizeScale, minWeight, showBots]);

  useEffect(() => {
    if (!sim.current) return;
    applyHighlight(selected);
    if (selected) recenter(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // when the story ends and exploration begins, re-frame the (decluttered) network,
  // unless a specific person is being focused (search jump), then let recenter win
  useEffect(() => {
    if (story || !sim.current) return;
    const t = setTimeout(() => {
      if (!useViz.getState().selected) refs.current.fitView?.(750);
    }, 480);
    return () => clearTimeout(t);
  }, [story]);

  function avatarFill(n: GNode) {
    const { defs, patterns } = refs.current;
    const pid = "av-" + (n.avatar || "").replace(/\W/g, "");
    if (!patterns.has(pid)) {
      patterns.add(pid);
      const p = defs.append("pattern").attr("id", pid)
        .attr("patternContentUnits", "objectBoundingBox").attr("width", 1).attr("height", 1);
      p.append("image").attr("href", n.avatar).attr("width", 1).attr("height", 1)
        .attr("preserveAspectRatio", "xMidYMid slice");
    }
    return `url(#${pid})`;
  }

  // Bubblemaps-style glossy sphere + colored glow halo, one gradient pair per color
  function grads(color: string) {
    const { defs, patterns } = refs.current;
    const key = "g" + color.replace(/\W/g, "");
    if (!patterns.has(key)) {
      patterns.add(key);
      const glow = defs.append("radialGradient").attr("id", "glow" + key);
      glow.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.6);
      glow.append("stop").attr("offset", "70%").attr("stop-color", color).attr("stop-opacity", 0.12);
      glow.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);
      const c = d3.color(color)!;
      const sph = defs.append("radialGradient").attr("id", "sph" + key).attr("cx", "36%").attr("cy", "30%").attr("r", "75%");
      sph.append("stop").attr("offset", "0%").attr("stop-color", String(c.brighter(1.1)));
      sph.append("stop").attr("offset", "58%").attr("stop-color", color);
      sph.append("stop").attr("offset", "100%").attr("stop-color", String(c.darker(1.4)));
    }
    return { glow: `url(#glow${key})`, sphere: `url(#sph${key})` };
  }

  function visible() {
    const st = useViz.getState();
    const nodes: GNode[] = [];
    const nodeC = new Map<string, number>();
    for (const n of data!.nodes) {
      if (n.is_bot && !st.showBots) continue;
      const c = nodeCommits(n, st.month, st.mode, st.windowSize);
      if (c <= 0) continue;
      nodeC.set(n.id, c);
      nodes.push(n);
    }
    const vis = new Set(nodes.map((n) => n.id));
    const links: GLink[] = [];
    const degree = new Map<string, number>();
    for (const l of data!.links) {
      if (!vis.has(l.s!) || !vis.has(l.t!)) continue;
      const w = linkWeight(l, st.month, st.mode, st.windowSize);
      if (w < st.minWeight) continue;
      l.w = w;
      links.push(l);
      degree.set(l.s!, (degree.get(l.s!) || 0) + 1);
      degree.set(l.t!, (degree.get(l.t!) || 0) + 1);
    }
    // keep everyone: connected people are vivid, the rest form a muted background sea
    return { nodes, links, nodeC, degree };
  }

  function update() {
    const st = useViz.getState();
    const { gNode, gLink, byId } = refs.current;
    const { nodes, links, nodeC, degree } = visible();
    const model = buildColorModel(data!.nodes, st.colorBy);
    const color = (n: GNode) => model.color(n);

    const val = (n: GNode) =>
      st.sizeBy === "degree" ? (degree.get(n.id) || 0)
      : st.sizeBy === "betweenness" ? n.betweenness
      : (nodeC.get(n.id) || 0);
    const scale = st.sizeScale;
    // dramatic size for connected "whale" contributors; muted sea stays small
    const connMax = d3.max(nodes.filter((n) => (degree.get(n.id) || 0) > 0), val) || 1;
    const rConn = d3.scaleSqrt().domain([0, connMax]).range([13, 46]);
    const rMuted = d3.scaleSqrt().domain([0, d3.max(nodes, val) || 1]).range([3.5, 9]);
    const radius = (n: GNode) => ((degree.get(n.id) || 0) > 0 ? rConn(val(n)) : rMuted(val(n))) * scale;

    const rect = svgRef.current!.getBoundingClientRect();
    const prev = new Set(sim.current!.nodes().map((n) => n.id));
    let added = 0;
    for (const l of links) {
      const na = byId.get(l.s!), nb = byId.get(l.t!);
      if (na && na.x == null && nb && nb.x != null) { na.x = nb.x + (Math.random() - 0.5) * 40; na.y = nb.y! + (Math.random() - 0.5) * 40; }
    }
    for (const n of nodes) {
      if (n.x == null) { n.x = rect.width / 2 + (Math.random() - 0.5) * 80; n.y = rect.height / 2 + (Math.random() - 0.5) * 80; }
      // a lost touchend must never leave a node pinned forever
      if (n.fx != null && !refs.current.dragging.has(n.id)) { n.fx = null; n.fy = null; }
      n.deg = degree.get(n.id) || 0;
      n.r = radius(n);
      if (!prev.has(n.id)) added++;
    }

    gLink.selectAll<SVGLineElement, GLink>("line")
      .data(links, (l: any) => l.s + "|" + l.t)
      .join(
        (enter: any) => enter.append("line").attr("class", "link"),
        (u: any) => u,
        (exit: any) => exit.remove()
      )
      .attr("stroke-opacity", 0.7)
      // floor at 1.6 so weight-1 ties stay legible, never hairline
      .attr("stroke-width", (l: GLink) => Math.min(2.7, 1.6 + Math.sqrt(l.w!) * 0.22));

    const nodeSel = gNode.selectAll<SVGGElement, GNode>("g.node")
      .data(nodes, (n: any) => n.id)
      .join(
        (enter: any) => {
          const g = enter.append("g").attr("class", "node").style("cursor", "pointer").style("opacity", 0);
          g.append("circle").attr("class", "halo").attr("pointer-events", "none").attr("r", 0);  // colored glow
          g.append("circle").attr("class", "body").attr("r", 0);                                  // sphere / avatar
          g.append("circle").attr("class", "sheen").attr("pointer-events", "none").attr("r", 0);   // glossy highlight
          g.call(refs.current.dragB);
          g.transition().duration(600).ease(d3.easeCubicOut).style("opacity", 1); // fade in
          g.on("mouseenter", function (this: any, _e: any, n: GNode) {
            useViz.getState().set("hovered", n.id);
            d3.select(this).raise();
            d3.select(this).select("circle.body").transition("hv").duration(160).attr("r", (n.r || 6) * 1.18);
            d3.select(this).select("circle.halo").transition("hv").duration(160).attr("r", (n.r || 6) * 2.6).attr("opacity", 1);
            if (!useViz.getState().selected) applyHighlight(n.id);
          })
            .on("mouseleave", function (this: any, _e: any, n: GNode) {
              useViz.getState().set("hovered", null);
              d3.select(this).select("circle.body").transition("hv").duration(220).attr("r", n.r || 6);
              d3.select(this).select("circle.halo").transition("hv").duration(220).attr("r", (n.r || 6) * 2.1).attr("opacity", (n.deg || 0) > 0 ? 0.95 : 0);
              if (!useViz.getState().selected) applyHighlight(null);
            })
            .on("click", (e: any, n: GNode) => { e.stopPropagation(); const cur = useViz.getState().selected; useViz.getState().set("selected", cur === n.id ? null : n.id); });
          return g;
        },
        (u: any) => u,
        (exit: any) => exit.transition().duration(320).ease(d3.easeCubicIn).style("opacity", 0).remove()
      );
    const conn = (n: GNode) => (n.deg || 0) > 0;
    const T = () => d3.transition().duration(450).ease(d3.easeCubicOut) as any;
    nodeSel.select("circle.halo")
      .attr("fill", (n: GNode) => grads(color(n)).glow)
      .attr("opacity", (n: GNode) => (conn(n) ? (n.is_bot ? 0.2 : 0.48) : 0)) // softer glow
      .transition(T()).attr("r", (n: GNode) => n.r! * 1.85);
    nodeSel.select("circle.body")
      // Bubblemaps-V2 grammar: the background sea is hollow rings, only people
      // who matter get filled color (the .ring class is theme-driven CSS)
      .classed("ring", (n: GNode) => !conn(n))
      .attr("fill", (n: GNode) => (!conn(n) ? "none" : n.avatar ? avatarFill(n) : grads(color(n)).sphere))
      .attr("fill-opacity", (n: GNode) => (n.is_bot && conn(n) ? 0.5 : 1))
      .attr("stroke", (n: GNode) => (conn(n) ? color(n) : null))
      .attr("stroke-opacity", (n: GNode) => (conn(n) ? 0.95 : null))
      .attr("stroke-width", (n: GNode) => (conn(n) ? Math.max(1.6, n.r! * 0.13) : 1))
      .transition(T()).attr("r", (n: GNode) => n.r!);
    nodeSel.select("circle.sheen")
      .attr("cx", (n: GNode) => -n.r! * 0.12)
      .attr("cy", (n: GNode) => -n.r! * 0.14)
      .attr("fill", "url(#sheen)")
      .attr("opacity", (n: GNode) => (!conn(n) ? 0 : n.avatar ? 0.16 : 0.5))
      .transition(T()).attr("r", (n: GNode) => n.r! * 0.86);

    // ambient radar pulse on connected "stations" (staggered, capped for perf)
    gNode.selectAll("circle.station").remove();
    const stations = new Set(
      nodes.filter((n) => (n.deg || 0) > 0 && !n.is_bot)
        .sort((a, b) => (nodeC.get(b.id) || 0) - (nodeC.get(a.id) || 0))
        .slice(0, 16).map((n) => n.id)
    );
    gNode.selectAll<SVGGElement, GNode>("g.node").filter((n) => stations.has(n.id))
      .insert("circle", ":first-child").attr("class", "station")
      .attr("r", (n) => n.r!).attr("fill", "none")
      .attr("stroke", (n) => color(n)).attr("stroke-width", 1.5)
      .style("animation-delay", (_n, i) => `${(i % 9) * 0.38}s`);

    // always-on labels for the top few "whales" so the hierarchy reads instantly
    gNode.selectAll("text.whale").remove();
    const whales = new Set(
      nodes.filter((n) => (n.deg || 0) > 0 && !n.is_bot)
        .sort((a, b) => (nodeC.get(b.id) || 0) - (nodeC.get(a.id) || 0))
        .slice(0, 5).map((n) => n.id)
    );
    gNode.selectAll<SVGGElement, GNode>("g.node").filter((n) => whales.has(n.id))
      .append("text").attr("class", "whale")
      .attr("text-anchor", "middle").attr("y", (n) => n.r! + 13)
      .attr("font-family", "var(--font-mono), monospace").attr("font-size", 9.5)
      .attr("paint-order", "stroke")
      .attr("stroke-width", 3).attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text((n) => n.name);

    refs.current.svg.on("click", () => useViz.getState().set("selected", null));

    sim.current!.nodes(nodes);
    (sim.current!.force("link") as d3.ForceLink<GNode, GLink>).links(links);
    sim.current!.alpha(Math.min(0.6, 0.1 + added / 35)).restart();

    if (st.selected) applyHighlight(st.selected);
  }

  function neighborWeights(id: string) {
    const w = new Map<string, number>();
    for (const l of (sim.current!.force("link") as d3.ForceLink<GNode, GLink>).links() as GLink[]) {
      if (l.s === id) w.set(l.t!, l.w!);
      else if (l.t === id) w.set(l.s!, l.w!);
    }
    return w;
  }

  function applyHighlight(id: string | null) {
    const { gNode, gLink } = refs.current;
    gNode.selectAll<SVGGElement, GNode>("g.node").selectAll("text.lbl").remove();
    gNode.selectAll("circle.ping").remove(); // clear any prior radar ping
    const cm = buildColorModel(data!.nodes, useViz.getState().colorBy);
    if (!id) {
      gNode.selectAll<SVGGElement, GNode>("g.node").style("opacity", 1);
      gNode.selectAll("text.whale").style("display", null);
      gNode.selectAll<SVGCircleElement, GNode>("circle.body")
        .filter((n) => (n.deg || 0) > 0)
        .attr("stroke", (n) => cm.color(n)).attr("stroke-opacity", 0.95)
        .attr("stroke-width", (n) => Math.max(1.4, n.r! * 0.14));
      gLink.selectAll<SVGLineElement, GLink>("line")
        .attr("stroke-opacity", 0.7).style("stroke", null).style("stroke-width", null);
      return;
    }
    const w = neighborWeights(id);
    const keep = new Set(w.keys()); keep.add(id);
    gNode.selectAll<SVGGElement, GNode>("g.node").style("opacity", (n) => (keep.has(n.id) ? 1 : 0.1));
    const focus = gNode.selectAll<SVGGElement, GNode>("g.node").filter((n) => n.id === id);
    // high-contrast focus ring, theme-aware (near-white on dark, ink on light)
    const focusRing = getComputedStyle(document.documentElement).getPropertyValue("--graph-ink-strong").trim() || "#ffffff";
    focus.select("circle.body").attr("stroke", focusRing).attr("stroke-opacity", 1).attr("stroke-width", (n) => Math.max(2, n.r! * 0.16));
    // radar ping emanating from the focused node
    focus.insert("circle", ":first-child").attr("class", "ping")
      .attr("r", (n) => n.r!).attr("fill", "none")
      .attr("stroke", (n) => cm.color(n)).attr("stroke-width", 2);
    // the focused person's ties flip white-hot; everything else fades to ghost
    gLink.selectAll<SVGLineElement, GLink>("line")
      .attr("stroke-opacity", (l) => (l.s === id || l.t === id ? 0.9 : 0.03))
      .style("stroke", (l) => (l.s === id || l.t === id ? "var(--graph-ink-strong)" : null))
      .style("stroke-width", (l) => (l.s === id || l.t === id ? "2.2px" : null));
    const top = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map((d) => d[0]);
    const labels = new Set(top); labels.add(id);
    // hide the resting whale labels for anyone getting a focus label, no doubles
    gNode.selectAll<SVGTextElement, GNode>("text.whale").style("display", (n) => (labels.has(n.id) ? "none" : null));
    gNode.selectAll<SVGGElement, GNode>("g.node").filter((n) => labels.has(n.id))
      .append("text").attr("class", "lbl")
      .attr("x", (n) => n.r! + 4).attr("y", 3)
      .attr("font-family", "var(--font-mono), monospace").attr("font-size", 10)
      .attr("paint-order", "stroke").attr("stroke-width", 3.5).attr("stroke-linejoin", "round")
      .text((n) => n.name);
  }

  function makeDrag() {
    const compact = () => (svgRef.current?.getBoundingClientRect().width ?? 1000) < 640;
    return d3.drag<SVGGElement, GNode>()
      .clickDistance(4) // finger jitter on a tap still selects, never counts as a drag
      .on("start", (e, d) => {
        if (useViz.getState().playing) useViz.getState().set("playing", false); // interacting ends the auto-play
        // energy-follows-input: no alphaTarget pump. Each pointer move injects
        // an alpha pulse scaled by pointer speed; hold still and the network
        // decays to true rest within a second, held node pinned to the pointer.
        d.dragDist = 0;
        refs.current.dragging.add(d.id);
        sim.current?.velocityDecay(compact() ? 0.66 : 0.6).alphaTarget(0); // viscous while interacting
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (e, d) => {
        d.dragDist = (d.dragDist || 0) + Math.hypot(e.dx, e.dy);
        d.fx = e.x; d.fy = e.y;
        const s = sim.current;
        if (!s) return;
        // slow ASMR strokes idle at 0.09; fast flicks pump harder so neighbors stay attached
        const pulse = Math.min(0.26, 0.09 + Math.hypot(e.dx, e.dy) * 0.01);
        if (s.alpha() < pulse) s.alpha(pulse);
        s.restart();
      })
      .on("end", (e, d) => {
        refs.current.dragging.delete(d.id);
        if (!e.active && sim.current) {
          sim.current.velocityDecay(compact() ? 0.62 : 0.46); // restore the resting spring
          // a real drag gets a gentle spring-back on release; a plain click stays still
          if ((d.dragDist || 0) > 3) sim.current.alpha(Math.max(sim.current.alpha(), 0.1)).restart();
        }
        d.fx = null; d.fy = null;
      });
  }

  function fitView(dur = 600) {
    const all = sim.current!.nodes().filter((n) => n.x != null);
    // frame the connected core; the muted background sea spills past the edges
    const conn = all.filter((n) => (n.deg || 0) > 0);
    const nodes = conn.length >= 3 ? conn : all;
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.x!).sort(d3.ascending);
    const ys = nodes.map((n) => n.y!).sort(d3.ascending);
    const maxR = d3.max(nodes, (n) => n.r || 8) || 8;
    const pad = 40 + maxR; // don't clip big whale bubbles at the edges
    const x0 = d3.quantileSorted(xs, 0.05)! - pad, x1 = d3.quantileSorted(xs, 0.95)! + pad;
    const y0 = d3.quantileSorted(ys, 0.05)! - pad, y1 = d3.quantileSorted(ys, 0.95)! + pad;
    const rect = svgRef.current!.getBoundingClientRect();
    // early in the story a handful of nodes would be zoomed in until the biggest one
    // fills the screen, so also cap the zoom by how large a node may look on screen
    const kFit = 0.68 * Math.min(rect.width / (x1 - x0), rect.height / (y1 - y0));
    const k = Math.max(0.3, Math.min(3, kFit, (0.08 * Math.min(rect.width, rect.height)) / maxR));
    const tx = (rect.width - k * (x0 + x1)) / 2;
    const ty = (rect.height - k * (y0 + y1)) / 2;
    refs.current.svg.transition().duration(dur).call(
      refs.current.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k)
    );
  }

  // fly the camera to a node so a selected/searched contributor is never off-screen
  function recenter(id: string) {
    const n = refs.current.byId?.get(id);
    if (!n || n.x == null || n.y == null) return;
    const s = svgRef.current!.getBoundingClientRect();
    // d3-zoom interpolates transforms with interpolateZoom, giving a smooth
    // fly-across-the-mesh (zoom out, pan, zoom in). A longer duration reads as travel.
    refs.current.svg.transition().duration(1050).ease(d3.easeCubicInOut).call(
      refs.current.zoom.transform,
      d3.zoomIdentity.translate(s.width / 2, s.height / 2).scale(1.85).translate(-n.x, -n.y)
    );
  }

  // expose fit for the store-driven "reset" (used after play ends)
  useEffect(() => { refs.current.fitView = fitView; });

  return <svg ref={svgRef} className="h-full w-full block" style={{ cursor: "grab" }} />;
}
