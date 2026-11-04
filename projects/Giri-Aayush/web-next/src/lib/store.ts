"use client";

import { create } from "zustand";
import type { ColorBy, GraphDoc, Mode, SizeBy } from "./graph";

export type Theme = "dark" | "light";

type VizState = {
  data: GraphDoc | null;
  theme: Theme;
  month: number;
  mode: Mode;
  windowSize: number;
  colorBy: ColorBy;
  sizeBy: SizeBy;
  sizeScale: number;
  minWeight: number;
  cleanMinWeight: number;
  showBots: boolean;
  allTies: boolean;
  playing: boolean;
  story: boolean;
  selected: string | null;
  hovered: string | null;

  load: () => Promise<void>;
  set: <K extends keyof VizState>(k: K, v: VizState[K]) => void;
  setMonth: (m: number) => void;
  togglePlay: () => void;
};

export const useViz = create<VizState>((setState, get) => ({
  data: null,
  theme: "dark",
  month: 0,
  mode: "cumulative",
  windowSize: 12,
  colorBy: "community",
  sizeBy: "commits",
  sizeScale: 1,
  minWeight: 1,
  cleanMinWeight: 2,
  showBots: false,
  allTies: false,
  playing: false,
  story: true,
  selected: null,
  hovered: null,

  load: async () => {
    if (get().data) return;
    const res = await fetch("graph.json");
    const data: GraphDoc = await res.json();
    for (const l of data.links) {
      l.s = l.source;
      l.t = l.target;
    }
    // Exploring keeps the same threshold the story ran at, so finishing (or skipping)
    // the animation never drops ties; the Min tie strength slider declutters on demand.
    const cleanMinWeight = 2;
    setState({ data, month: 0, minWeight: 2, cleanMinWeight, story: true, playing: true });
  },
  set: (k, v) => setState({ [k]: v } as Partial<VizState>),
  setMonth: (m) => setState({ month: m }),
  togglePlay: () => setState((s) => ({ playing: !s.playing })),
}));
