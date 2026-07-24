import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GraphData } from "./graph-types";

let cached: GraphData | null = null;

/** Server-side read of the same file the client fetches from /data at
 * runtime, so the landing page's stats never drift from what the explorer
 * shows. */
export async function loadGraph(): Promise<GraphData> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "data", "z10-graph.json");
  const raw = await readFile(file, "utf-8");
  cached = JSON.parse(raw) as GraphData;
  return cached;
}
