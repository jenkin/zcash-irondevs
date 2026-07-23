# Z10 web

The Next.js frontend: the landing page (`src/app/page.tsx`) and the
interactive explorer (`src/app/explorer/page.tsx`,
`src/components/Explorer.tsx`, `src/components/GraphCanvas.tsx`).

See the [project README](../README.md) for what this is, how the pipeline
behind it works, and the required-feature mapping.

```bash
npm install
npm run dev
```

Reads its data from `public/data/z10-graph.json`, produced by the Python
pipeline in `../pipeline`.
