"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, Snapshot } from "@/lib/graph-types";
import { colorForCommunity, labelCommunities, labelForCommunity } from "@/lib/layout";
import { idToSlug } from "@/lib/contributor";
import { useAudio } from "@/lib/audio-context";
import { fmtInt, fmtDecimal, pctBetween } from "@/lib/format";
import { CHAPTERS, ROMAN } from "@/lib/chapters";
import GraphCanvas, { type HoverInfo } from "./GraphCanvas";

type Mode = "cumulative" | "window";

export default function Explorer() {
  const [data, setData] = useState<GraphData | null>(null);
  const [cp, setCp] = useState(10);
  const [mode, setMode] = useState<Mode>("cumulative");
  const [sel, setSel] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [intro, setIntro] = useState(true);
  const [playing, setPlaying] = useState(false);
  const { playing: audioPlaying, toggle: toggleAudio, play: playAudio } = useAudio();
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(64);
  const [vw, setVw] = useState(1280);
  const isMobile = vw < 640;

  // Measured, not guessed: the header wraps to two rows on narrow viewports
  // (see the header markup below), so its real height varies with viewport
  // width and content, not just a fixed breakpoint.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    setHeaderH(el.offsetHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setVw(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    fetch("/data/z10-graph.json")
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        setCp(d.milestones.length - 1);
        // A profile page's "See them in the network" link lands here as
        // /explorer?sel=<id> -- read it directly off the URL rather than
        // useSearchParams, which would force this whole client component
        // behind a Suspense boundary for no benefit (there's no server
        // render of this value to hydrate against).
        const id = new URLSearchParams(window.location.search).get("sel");
        if (id && d.identities[id]) {
          setSel(id);
          setIntro(false);
        }
      });
  }, []);

  useEffect(() => {
    return () => {
      if (playTimer.current) clearInterval(playTimer.current);
    };
  }, []);

  const activeSnapshots: Snapshot[] = useMemo(() => {
    if (!data) return [];
    return mode === "cumulative" ? data.snapshots : data.windowSnapshots;
  }, [data, mode]);

  const snapshot = activeSnapshots[cp] ?? null;
  const chapter = CHAPTERS[cp] ?? CHAPTERS[0];
  const milestone = data?.milestones[cp];

  const t0 = data ? new Date(data.milestones[0].date).getTime() : 0;
  const t1 = data ? new Date(data.milestones[data.milestones.length - 1].date).getTime() : 1;
  const progressPct = milestone ? pctBetween(milestone.date, t0, t1) : 0;

  const searchResults = useMemo(() => {
    if (!data || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(data.identities)
      .filter(([, ident]) => ident.name.toLowerCase().includes(q))
      .sort((a, b) => b[1].commitCount - a[1].commitCount)
      .slice(0, 6)
      .map(([id, ident]) => ({ id, name: ident.name, commits: ident.commitCount }));
  }, [data, query]);

  const selectedNode = useMemo(() => {
    if (!sel || !snapshot) return null;
    return snapshot.nodes.find((n) => n.id === sel) ?? null;
  }, [sel, snapshot]);

  const selectedCollabs = useMemo(() => {
    if (!sel || !snapshot) return [];
    return snapshot.edges
      .filter((e) => e.source === sel || e.target === sel)
      .map((e) => ({ id: e.source === sel ? e.target : e.source, w: e.weight }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 5)
      .map((c) => ({ ...c, name: snapshot.nodes.find((n) => n.id === c.id)?.name ?? c.id }));
  }, [sel, snapshot]);

  const selectedRank = useMemo(() => {
    if (!sel || !snapshot) return null;
    const sorted = [...snapshot.nodes].sort((a, b) => b.degree - a.degree);
    const idx = sorted.findIndex((n) => n.id === sel);
    return idx >= 0 ? { rank: idx + 1, of: sorted.length } : null;
  }, [sel, snapshot]);

  const betweennessSeries = useMemo(() => {
    if (!sel || !data) return [];
    return data.snapshots.map((s) => s.nodes.find((n) => n.id === sel)?.betweenness ?? 0);
  }, [sel, data]);

  const selectedCommunityLabel = useMemo(() => {
    if (!selectedNode || selectedNode.community < 0 || !snapshot) return null;
    const members = snapshot.nodes.filter((n) => n.community === selectedNode.community);
    return labelForCommunity(members, selectedNode.community);
  }, [selectedNode, snapshot]);

  const legend = useMemo(() => {
    if (!snapshot) return [];
    const byCommunity = new Map<number, typeof snapshot.nodes>();
    for (const n of snapshot.nodes) {
      if (n.community < 0) continue;
      const list = byCommunity.get(n.community) ?? [];
      list.push(n);
      byCommunity.set(n.community, list);
    }
    const labels = labelCommunities(byCommunity);
    return [...byCommunity.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6)
      .map(([id, members]) => ({
        id,
        count: members.length,
        color: colorForCommunity(id),
        label: labels.get(id) ?? `Community ${id + 1}`,
      }));
  }, [snapshot]);

  function startPlay() {
    stopPlay();
    setPlaying(true);
    setIntro(false);
    playAudio();
    playTimer.current = setInterval(() => {
      setCp((c) => {
        const max = (data?.milestones.length ?? 1) - 1;
        if (c >= max) {
          stopPlay();
          return c;
        }
        return c + 1;
      });
    }, 1800);
  }
  function stopPlay() {
    if (playTimer.current) clearInterval(playTimer.current);
    playTimer.current = null;
    setPlaying(false);
  }

  function cpFromClientX(clientX: number): number {
    if (!data || !timelineRef.current) return cp;
    const rect = timelineRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left - 52) / (rect.width - 100)));
    const pos = frac * 100;
    let best = 0;
    let bd = Infinity;
    data.milestones.forEach((m, i) => {
      const d = Math.abs(pctBetween(m.date, t0, t1) - pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  if (!data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <p className="kicker">Loading the decade...</p>
      </div>
    );
  }

  const maxCp = data.milestones.length - 1;
  const chaptersWidth = isMobile ? vw : 390;
  const selWidth = isMobile ? vw : 350;

  function selectNode(id: string | null) {
    setSel(id);
    setIntro(false);
    // On a phone, a full-width Chapters panel and a full-width Selected
    // panel can't both make sense on one screen at once -- picking a node
    // closes Chapters rather than stacking two full-screen overlays.
    if (isMobile && id) setChaptersOpen(false);
  }

  function toggleChapters() {
    setChaptersOpen((c) => {
      const next = !c;
      if (isMobile && next) setSel(null);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: "var(--color-bg)", fontFamily: "var(--font-body)", color: "var(--color-text)" }}
    >
      {/* header */}
      <div
        ref={headerRef}
        className="absolute left-0 right-0 top-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5 lg:h-16 lg:flex-nowrap lg:px-5 lg:py-0"
        style={{ borderColor: "var(--color-divider)", background: "var(--color-bg)", zIndex: 6 }}
      >
        <div className="flex min-w-0 flex-none items-center gap-3.5">
          <Link href="/" style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 22, letterSpacing: "-0.01em", whiteSpace: "nowrap", color: "inherit", textDecoration: "none" }}>
            Heroes of Z10
          </Link>
          <span className="hidden lg:inline" style={{ width: 1, height: 20, background: "var(--color-divider)" }} />
          <span className="hidden lg:inline" style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
            Ten years of Zcash, annotated
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5 lg:flex-none">
          <div className="relative" style={{ width: isMobile ? 130 : 230, minWidth: 100, flex: isMobile ? "1 1 auto" : "none" }}>
            <input
              className="input"
              style={{ width: "100%", minHeight: 34 }}
              placeholder="Search a contributor"
              aria-label="Search a contributor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults.length) {
                  selectNode(searchResults[0].id);
                  setQuery("");
                }
                if (e.key === "Escape") setQuery("");
              }}
            />
            {searchResults.length > 0 && (
              <div
                className="absolute right-0 top-10 border"
                style={{ width: isMobile ? Math.min(260, vw - 20) : 300, background: "var(--color-bg)", borderColor: "var(--color-divider)", boxShadow: "0 3px 10px rgba(45,43,43,0.16)", zIndex: 8 }}
              >
                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                    margin: 0,
                    padding: "8px 14px",
                    borderBottom: "1px solid var(--color-divider)",
                  }}
                >
                  {searchResults.length} {searchResults.length === 1 ? "person matches" : "people match"} &ldquo;{query}&rdquo;
                </p>
                {searchResults.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      selectNode(r.id);
                      setQuery("");
                    }}
                    className="flex cursor-pointer items-baseline justify-between border-t px-3.5 py-2.5 hover:bg-black/5"
                    style={{ borderColor: "var(--color-divider)" }}
                  >
                    <span style={{ fontSize: 14 }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{fmtInt(r.commits)} commits</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="seg" role="radiogroup" aria-label="View mode">
            <label className="seg-opt">
              <input type="radio" name="viewmode" checked={mode === "cumulative"} onChange={() => setMode("cumulative")} />
              {isMobile ? "Cum." : "Cumulative"}
            </label>
            <label className="seg-opt">
              <input type="radio" name="viewmode" checked={mode === "window"} onChange={() => setMode("window")} />
              {isMobile ? "Win." : "Window"}
            </label>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={toggleChapters}
            style={{ background: chaptersOpen ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent" }}
          >
            Chapters
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="absolute left-0 right-0" style={{ top: headerH, bottom: 96 }}>
        <GraphCanvas snapshot={snapshot} identities={data.identities} selectedId={sel} query={query} showHulls={chaptersOpen} onHover={setHover} onSelect={selectNode} />
      </div>

      {/* caption */}
      {!chaptersOpen && milestone && (
        <div className="pointer-events-none absolute z-[2]" style={{ left: isMobile ? 20 : 48, top: headerH + 30, maxWidth: isMobile ? vw - 40 : 420 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
            Checkpoint {ROMAN[cp] ?? cp + 1}: {milestone.name}, {chapter.date}
          </span>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 22, lineHeight: 1.3, margin: "10px 0 0", maxWidth: "34ch" }}>{chapter.cap}</p>
          <p style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "8px 0 0" }}>
            {snapshot ? snapshot.nodes.length : 0} people in view, {mode === "cumulative" ? "cumulative" : "sliding 18 month window"}
            {snapshot && snapshot.edgeCountFull && snapshot.edgeCountFull > snapshot.edges.length
              ? ` (showing each person's strongest ties, ${fmtInt(snapshot.edges.length)} of ${fmtInt(snapshot.edgeCountFull)} real ones drawn)`
              : ""}
          </p>
        </div>
      )}

      {/* legend */}
      <div
        className="pointer-events-none absolute z-[2] flex flex-col gap-1.5 transition-[left] duration-300"
        style={{ left: chaptersOpen ? chaptersWidth + 38 : isMobile ? 20 : 48, bottom: 120 }}
      >
        {legend.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${l.color}` }} />
            <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>{l.label}</span>
          </div>
        ))}
        {snapshot && snapshot.nodes.length > 2 && !snapshot.nodes.some((n) => n.isBridge) && (
          <p style={{ fontSize: 11, maxWidth: 220, marginTop: 4, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
            No structural bridges here: nobody&rsquo;s departure would split this network.
          </p>
        )}
      </div>

      {/* hover tooltip */}
      {hover && hover.id !== sel && (
        <div
          className="pointer-events-none absolute z-[5] flex max-w-[280px] items-center gap-2.5 border px-3.5 py-2.5"
          style={{ left: hover.x, top: hover.y + headerH - 10, background: "var(--color-bg)", borderColor: "var(--color-divider)", boxShadow: "0 1px 2px rgba(45,43,43,0.14)" }}
        >
          <Avatar login={data.identities[hover.id]?.githubLogin ?? null} size={32} />
          <div>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15, margin: 0, whiteSpace: "nowrap" }}>{hover.node.name}</p>
            <p style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 65%, transparent)", margin: "3px 0 0", whiteSpace: "nowrap" }}>
              {fmtInt(hover.node.degree)} weighted degree
            </p>
          </div>
        </div>
      )}

      {/* selected contributor panel */}
      {selectedNode && (
        <div
          className="absolute right-0 flex flex-col overflow-y-auto border-l px-5 py-6 sm:px-7"
          style={{ top: headerH, bottom: 96, width: selWidth, background: "var(--color-bg)", borderColor: "var(--color-divider)", zIndex: 4 }}
        >
          <div className="flex items-start justify-between">
            <span style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Selected contributor</span>
            <button type="button" className="btn btn-icon btn-ghost" aria-label="Close panel" onClick={() => setSel(null)} style={{ width: 26, height: 26, fontSize: 15, margin: "-6px -8px 0 0" }}>
              ×
            </button>
          </div>
          <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
            <Avatar login={data.identities[selectedNode.id]?.githubLogin ?? null} size={48} />
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 29, lineHeight: 1.1, margin: 0 }}>{selectedNode.name}</h2>
          </div>
          <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 65%, transparent)", margin: "8px 0 0" }}>
            {data.identities[selectedNode.id]?.aliasCount ?? 1} {(data.identities[selectedNode.id]?.aliasCount ?? 1) === 1 ? "identity" : "identities merged"}
          </p>
          {selectedNode.isBridge && (
            <p style={{ fontSize: 12, color: "var(--color-accent-700)", margin: "8px 0 0" }}>
              Structural bridge at this checkpoint: no other path connects parts of their community without them.
            </p>
          )}
          <hr className="rule" style={{ margin: "16px 0" }} />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
            <Stat value={fmtDecimal(selectedNode.degree)} label="Weighted degree" />
            <Stat value={fmtDecimal(selectedNode.betweenness, 3)} label="Betweenness" />
            <Stat value={selectedCommunityLabel ?? "None"} label="Community" />
            <Stat value={selectedRank ? `${selectedRank.rank} of ${selectedRank.of}` : "None"} label="Rank by degree" />
          </div>
          <hr className="rule" style={{ margin: "16px 0" }} />
          <p style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "0 0 10px" }}>Closest collaborators</p>
          <div className="flex flex-col gap-1.5">
            {selectedCollabs.length === 0 && <p style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>No ties yet at this checkpoint.</p>}
            {selectedCollabs.map((c) => (
              <div key={c.id} className="flex cursor-pointer justify-between text-[13.5px] hover:text-[color:var(--color-accent-700)]" onClick={() => setSel(c.id)}>
                <span>{c.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{fmtDecimal(c.w)}</span>
              </div>
            ))}
          </div>
          <hr className="rule" style={{ margin: "16px 0" }} />
          <p style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "0 0 10px" }}>Repositories</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedNode.repos.length === 0 && <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>None recorded yet.</span>}
            {selectedNode.repos.map((r) => (
              <span key={r} className="tag tag-neutral">
                {r}
              </span>
            ))}
          </div>
          <hr className="rule" style={{ margin: "16px 0" }} />
          <p style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "0 0 10px" }}>Betweenness, by checkpoint</p>
          <Sparkline values={betweennessSeries} current={cp} />
          {!selectedNode.isBot && (
            <>
              <hr className="rule" style={{ margin: "16px 0" }} />
              <Link href={`/contributor/${encodeURIComponent(idToSlug(selectedNode.id))}`} className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>
                Full profile, shareable
              </Link>
            </>
          )}
        </div>
      )}

      {/* chapters panel */}
      {chaptersOpen && (
        <div
          className="absolute left-0 flex flex-col overflow-y-auto border-r px-5 py-6 sm:px-[30px]"
          style={{ top: headerH, bottom: 96, width: chaptersWidth, background: "var(--color-bg)", borderColor: "var(--color-divider)", zIndex: 4 }}
        >
          <span style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Chapter {ROMAN[cp]} of {ROMAN[maxCp] ?? maxCp + 1}</span>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 32, lineHeight: 1.1, margin: "10px 0 0" }}>{milestone?.name}</h2>
          <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 65%, transparent)", margin: "8px 0 0" }}>Checkpoint date, {chapter.date}</p>
          <hr className="rule" style={{ margin: "16px 0" }} />
          {chapter.prose.map((p, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.7, textAlign: "justify", margin: "0 0 12px", color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
              {p}
            </p>
          ))}
          <hr className="rule" style={{ margin: "6px 0 16px" }} />
          <p style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "0 0 12px" }}>
            Community events at this checkpoint
          </p>
          <div className="flex flex-col gap-3">
            {chapter.events.length === 0 && (
              <p style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Nothing to show yet, there&rsquo;s no network here to speak of.</p>
            )}
            {chapter.events.map((ev, i) => (
              <div key={i} className="flex items-baseline gap-2.5">
                <span className={`tag ${ev.cls}`} style={{ flex: "none" }}>
                  {ev.kind}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.55, color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>{ev.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-5">
            <div className="relative mb-3.5" style={{ height: 1, background: "var(--color-divider)" }}>
              <div className="absolute left-0 top-0" style={{ height: 1, width: `${((cp + 1) / (maxCp + 1)) * 100}%`, background: "var(--color-accent)" }} />
            </div>
            <div className="flex justify-between">
              <button type="button" className="btn btn-ghost" onClick={() => setCp((c) => Math.max(0, c - 1))}>
                {cp > 0 ? `< ${ROMAN[cp - 1]}: ${data.milestones[cp - 1].name}` : "< Beginning"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCp((c) => Math.min(maxCp, c + 1))}>
                {cp < maxCp ? `${ROMAN[cp + 1]}: ${data.milestones[cp + 1].name} >` : "The present >"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* timeline */}
      <div
        ref={timelineRef}
        className="absolute bottom-0 left-0 right-0 border-t"
        style={{ height: 96, background: "var(--color-bg)", borderColor: "var(--color-divider)", zIndex: 6, cursor: "pointer", touchAction: "none" }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          stopPlay();
          setCp(cpFromClientX(e.clientX));
          setIntro(false);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          setCp(cpFromClientX(e.clientX));
        }}
      >
        <button
          type="button"
          className="btn btn-icon btn-ghost absolute"
          aria-label="Play through the decade"
          onClick={() => (playing ? stopPlay() : startPlay())}
          style={{ left: 10, top: 18, width: 28, height: 28, fontSize: 11 }}
        >
          {playing ? "II" : ">"}
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost absolute"
          aria-label={audioPlaying ? "Pause the music" : "Play the music"}
          onClick={toggleAudio}
          style={{ right: 10, top: 18, width: 28, height: 28, fontSize: 11 }}
        >
          {audioPlaying ? "II" : "♪"}
        </button>
        <div className="absolute" style={{ left: 52, right: 48, top: 0, bottom: 0 }}>
          <div className="absolute left-0 right-0" style={{ top: 34, height: 1, background: "var(--color-divider)" }} />
          {mode === "cumulative" ? (
            <div className="absolute" style={{ left: 0, top: 34, height: 1.5, background: "var(--color-accent)", opacity: 0.85, width: `${progressPct}%`, transition: "width .35s ease" }} />
          ) : (
            <div className="absolute" style={{ top: 31, height: 7, borderLeft: "2px solid var(--color-accent)", borderRight: "2px solid var(--color-accent)", left: `${Math.max(0, progressPct - 12)}%`, width: "12%" }} />
          )}
          {data.milestones.map((m, i) => {
            const act = i === cp;
            const left = pctBetween(m.date, t0, t1);
            return (
              <div
                key={m.name}
                onClick={() => {
                  setCp(i);
                  setIntro(false);
                }}
                className="absolute z-[2] cursor-pointer"
                style={{ left: `${left}%`, top: 27 }}
              >
                <div style={{ width: 1, height: 8, background: act ? "var(--color-accent)" : "color-mix(in srgb, var(--color-text) 30%, transparent)", marginLeft: -0.5 }} />
                {/* On a phone, real calendar-proportional spacing crams the
                    early, tightly-clustered milestones' text into an
                    illegible overlap -- only the active one's name is shown,
                    the always-visible caption/chapter panel already carries
                    the rest of the context. */}
                {(!isMobile || act) && (
                  <div
                    className="absolute whitespace-nowrap"
                    style={{
                      top: i % 2 ? 26 : 11,
                      left: 0,
                      transform: i === 0 ? "translateX(-4px)" : i === maxCp ? "translateX(calc(-100% + 6px))" : "translateX(-50%)",
                      fontSize: 9.5,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      color: act ? "var(--color-accent-700)" : "color-mix(in srgb, var(--color-text) 55%, transparent)",
                    }}
                  >
                    {m.name}
                  </div>
                )}
              </div>
            );
          })}
          <div
            className="pointer-events-none absolute"
            style={{ left: `${progressPct}%`, top: 34.5, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: "var(--color-bg)", border: "1.5px solid var(--color-accent)", zIndex: 3, transition: "left .35s ease" }}
          >
            <div className="absolute" style={{ inset: 2.5, borderRadius: "50%", background: "var(--color-accent)" }} />
          </div>
        </div>
      </div>

      {/* intro overlay */}
      {intro && (
        <div
          className="absolute z-[7] text-center"
          style={{ left: "50%", top: "44%", transform: "translate(-50%,-50%)", width: 620, maxWidth: "90vw", background: "var(--color-bg)", border: "1px solid var(--color-divider)", boxShadow: "0 12px 32px rgba(45,43,43,0.22)", padding: "44px 40px 38px" }}
        >
          <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>A decade of Zcash, annotated</span>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 42, lineHeight: 1.12, letterSpacing: "-0.008em", margin: "16px 0 0" }}>
            Ten years of a protocol, told through the people who wrote it.
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "color-mix(in srgb, var(--color-text) 75%, transparent)", margin: "18px auto 0", maxWidth: "52ch" }}>
            Heroes of Z10 reads the entire git record, {data.meta.repoCount} repositories, {fmtInt(data.meta.commitCount)} commits, {data.meta.authorCount} people, and draws the co-authorship network as it formed, merged, split and endured, one upgrade at a time.
          </p>
          <div className="mt-6 flex justify-center gap-3.5">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCp(0);
                startPlay();
              }}
            >
              Begin at the start
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIntro(false);
                setCp(maxCp);
              }}
            >
              Explore freely
            </button>
          </div>
          <p style={{ fontSize: 11, letterSpacing: "0.04em", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "22px 0 0" }}>
            Scrub the timeline, search a name, click a node
          </p>
        </div>
      )}
    </div>
  );
}

function Avatar({ login, size }: { login: string | null; size: number }) {
  // Only rendered for contributors whose real GitHub login we can prove from
  // their own commit metadata (a `users.noreply.github.com` address encodes
  // it directly) -- everyone else gets no image rather than a fabricated
  // one. `github.com/<login>.png` is GitHub's own stable avatar redirect.
  if (!login) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flex: "none",
          border: "1px solid var(--color-divider)",
          background: "color-mix(in srgb, var(--color-text) 6%, transparent)",
        }}
      />
    );
  }
  return (
    // One small external avatar at a time (hover/selection), not a page-scale image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://github.com/${login}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: "50%", flex: "none", border: "1px solid var(--color-divider)", objectFit: "cover" }}
    />
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  // A community label like "LIBRUSTZCASH" is a single long word with no
  // spaces to wrap at -- at the fixed 26px size it doesn't shrink to fit its
  // grid column (a 1fr track can shrink the column itself, but not the text
  // inside it), so it overflows sideways into whatever sits next to it.
  // Shrinking the font for long values and allowing a mid-word break as a
  // last resort keeps it inside its own column instead.
  const long = value.length > 10;
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 400,
          fontSize: long ? 17 : 26,
          margin: 0,
          fontVariantNumeric: "lining-nums",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}

function Sparkline({ values, current }: { values: number[]; current: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || values.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(0.0001, ...values) * 1.15;
    const n = values.length - 1 || 1;
    const x0 = 2;
    const x1 = w - 2;
    const y0 = h - 8;
    const y1 = 5;
    const X = (i: number) => x0 + ((x1 - x0) * i) / n;
    const Y = (v: number) => y0 - ((y0 - y1) * v) / max;
    ctx.strokeStyle = "rgba(32,31,29,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 0.5);
    ctx.lineTo(x1, y0 + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "#201f1d";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(0), Y(v))));
    ctx.stroke();
    const cx = Math.min(current, n);
    ctx.fillStyle = "#f3f2f2";
    ctx.strokeStyle = "#b68235";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(X(cx), Y(values[cx] ?? 0), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [values, current]);
  return <canvas ref={ref} style={{ width: "100%", height: 52 }} />;
}
