# Web visualization

The interactive front end for the co-authorship network. Next.js (static
export), Tailwind, D3 force layout, Framer Motion. It reads
`public/graph.json`, which the Python pipeline in `../pipeline/` generates.

## Where to read

| File | What it does |
|---|---|
| `src/lib/graph.ts` | types, time slicing, color model, stats |
| `src/lib/store.ts` | zustand state: month, mode, filters, selection, theme |
| `src/components/GraphCanvas.tsx` | the D3 force simulation and all node/tie rendering |
| `src/components/Timeline.tsx` | scrubber, histogram, cumulative/window toggle |
| `src/components/ControlPanel.tsx` | masthead, search, collapsible controls and legend |
| `src/components/SelectionCard.tsx` | the contributor profile card |
| `src/components/StoryCaption.tsx` | the narrated decade playback |

## Develop

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build      # static export -> out/
```

Only source is committed. After regenerating `public/graph.json`, rebuild to
refresh `out/`, then serve it statically (see the main README).
