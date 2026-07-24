# Heroes of Z10, the web app

The Next.js frontend: the landing page (`src/app/page.tsx`), the
interactive explorer (`src/app/explorer/page.tsx`,
`src/components/Explorer.tsx`, `src/components/GraphCanvas.tsx`), the
per-contributor profile pages (`src/app/contributor/[id]/page.tsx`), and
the directory (`src/app/contributors/page.tsx`).

See the [project README](../README.md) for what this is, how the Python
pipeline behind it works, and the required-feature mapping.

```bash
npm install
npm run dev
```

Reads its data from `public/data/z10-graph.json`, produced by the pipeline
in `../pipeline`. That file is checked into the repo, so `npm run dev`
works on its own without running the pipeline first; regenerate it with
the command in the project README if the underlying repos change.

Everything is statically exported at build time
(`generateStaticParams` builds one page per contributor), so there's no
server-side data fetching or API route in the running app.
