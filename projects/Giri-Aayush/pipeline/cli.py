"""Command-line entry point: mine -> build -> export graph.json."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from . import avatars as avatars_mod
from .graph import build
from .mine import mine_all


def _default_data() -> Path:
    for cand in ("../../data", "./data", "data"):
        p = Path(cand)
        if p.is_dir() and any(p.glob("*/*.git")):
            return p.resolve()
    return Path("../../data")  # submission layout default


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        prog="ironwood",
        description="Build the Zcash dynamic co-authorship network.",
    )
    ap.add_argument("--data", type=Path, default=None, help="bare-repo root (default: autodetect)")
    ap.add_argument("--out", type=Path, default=Path("web-next/public/graph.json"),
                    help="output JSON (default: the Next.js app's public/ dir)")
    ap.add_argument("--workers", type=int, default=None, help="mining worker processes")
    ap.add_argument("--no-incremental", action="store_true", help="ignore mining cache")
    ap.add_argument("--avatars", action="store_true",
                    help="fetch GitHub avatars via gh (downloaded locally, cached)")
    ap.add_argument("--max-nodes", type=int, default=500,
                    help="cap rendered network to the top-N contributors (0 = no cap)")
    args = ap.parse_args(argv)

    data_root = (args.data or _default_data()).resolve()
    print(f"▸ data:    {data_root}")

    t0 = time.perf_counter()
    print("▸ mining commits …")
    cache_dir = None
    if args.no_incremental:
        cache_dir = data_root.parent / ".cache" / "mine-fresh"
    records = mine_all(data_root, cache_dir=cache_dir, workers=args.workers)
    t_mine = time.perf_counter() - t0

    out = args.out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    web_dir = out.parent
    cache_dir = data_root.parent / ".cache"

    if args.avatars:
        repos = sorted({r["repo"] for r in records})
        manifest = avatars_mod.build_manifest(records, repos, web_dir, cache_dir)
    else:
        manifest = avatars_mod.load_manifest(web_dir)

    print(f"▸ building network from {len(records)} commits …")
    doc = build(records, avatars=manifest, max_nodes=args.max_nodes)
    doc["meta"]["generated_utc"] = datetime.now(timezone.utc).isoformat()
    doc["meta"]["avatars"] = len(manifest)
    out.write_text(json.dumps(doc, separators=(",", ":")))
    dt = time.perf_counter() - t0

    m = doc["meta"]
    shown = (f"{m['n_contributors']} of {m['n_contributors_total']}"
             if m["n_contributors"] < m["n_contributors_total"] else str(m["n_contributors"]))
    print(
        f"✓ {m['n_commits']} commits · {m['n_repos']} repos · {shown} contributors shown · "
        f"{m['n_edges']} co-authorship edges · {m['n_months']} months "
        f"({m['months'][0]} → {m['months'][-1]})"
    )
    print(f"✓ wrote {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out} "
          f"({out.stat().st_size / 1024:.0f} KB)")
    print(f"✓ mine {t_mine:.1f}s · total {dt:.1f}s")


if __name__ == "__main__":
    main()
