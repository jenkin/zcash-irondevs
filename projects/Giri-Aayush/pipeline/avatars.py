"""Optional avatar enrichment.

GitHub avatars can't be derived from a commit email alone, but the GitHub
commits API exposes ``commit.author.email -> author.id`` for every commit whose
email is linked to a GitHub account. We page through it with the ``gh`` CLI
(uses the user's token), map our deduplicated identities to GitHub user ids, and
**download the avatars locally** so the visualization stays offline-safe.

Everything is cached and committed (``web/avatars/`` + ``manifest.json``), so:
  * running the pipeline WITHOUT ``--avatars`` still shows committed avatars,
  * re-running WITH ``--avatars`` only fetches identities not already resolved,
  * a machine with no ``gh`` / no network degrades gracefully to colored dots.
"""

from __future__ import annotations

import io
import json
import subprocess
import urllib.request
from collections import Counter
from pathlib import Path

from .identity import IdentityResolver


def _is_placeholder_avatar(data: bytes) -> bool:
    """True for GitHub's default identicons and solid-color fills.

    Those read as ugly geometric blocks in the network, so we skip them and let
    the node render as its clean community-colored sphere instead. A GitHub
    identicon is one or two flat colors on GitHub's ``#f0f0f0`` field; a solid
    fill is a single color. Real photos and logos have far richer palettes.

    Graceful: if Pillow isn't installed we keep the avatar rather than crash, so
    the pipeline still runs on a bare environment (just without this polish).
    """
    try:
        from PIL import Image
    except ModuleNotFoundError:
        return False
    try:
        im = Image.open(io.BytesIO(data)).convert("RGB").resize((48, 48), Image.NEAREST)
    except Exception:  # noqa: BLE001, an undecodable blob is not our concern here
        return False
    px = list(im.getdata())
    n = len(px) or 1

    def near_grey(p: tuple[int, int, int], t: tuple[int, int, int] = (240, 240, 240), tol: int = 14) -> bool:
        return all(abs(p[i] - t[i]) <= tol for i in range(3))

    grey_bg = sum(1 for p in px if near_grey(p)) / n
    quantized = len(Counter((r >> 4, g >> 4, b >> 4) for r, g, b in px))
    return (quantized <= 4 and grey_bg >= 0.30) or quantized <= 1


def _gh_email_map(repos: list[str], cache_file: Path) -> dict[str, str]:
    """email (lowercased) -> GitHub user id, via the commits API. Cached."""
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    mapping: dict[str, str] = {}
    for slug in repos:
        try:
            out = subprocess.run(
                ["gh", "api", "--paginate",
                 f"/repos/{slug}/commits?per_page=100",
                 "--jq", '.[] | select(.author != null) | '
                         '[(.commit.author.email // "" | ascii_downcase), (.author.id|tostring)] | @tsv'],
                capture_output=True, text=True, check=True, timeout=600,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"    · {slug}: avatar lookup skipped ({type(e).__name__})")
            continue
        n = 0
        for line in out.stdout.splitlines():
            email, _, gid = line.partition("\t")
            if email and gid:
                mapping.setdefault(email, gid)
                n += 1
        print(f"    · {slug}: {n} authored commits mapped")

    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(mapping))
    return mapping


def build_manifest(records: list[dict], repos: list[str], web_dir: Path, cache_dir: Path) -> dict[str, str]:
    """Resolve identities -> GitHub avatars, download them, return {cid: filename}."""
    av_dir = web_dir / "avatars"
    av_dir.mkdir(parents=True, exist_ok=True)
    manifest_file = av_dir / "manifest.json"
    manifest: dict[str, str] = (
        json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    )

    print("▸ resolving GitHub avatars …")
    email_map = _gh_email_map(repos, cache_dir / "gh_authors.json")
    if not email_map:
        return manifest

    # re-derive canonical identities (cheap) to get every email per person
    resolver = IdentityResolver()
    for r in records:
        resolver.observe(r["author_name"], r["author_email"])
        resolver.observe(r["committer_name"], r["committer_email"])
        for n, e in r["co_authors"]:
            resolver.observe(n, e)
    identities = resolver.resolve()

    fetched = 0
    for cid, ident in identities.items():
        if cid in manifest:
            continue
        gid = next((email_map[e] for e in ident.emails if e in email_map), None)
        if not gid:
            continue
        # reuse an already-downloaded file for this GitHub id, whatever its extension
        existing = next((p for p in av_dir.glob(f"{gid}.*")), None)
        if existing:
            manifest[cid] = existing.name
            continue
        try:
            req = urllib.request.Request(
                f"https://avatars.githubusercontent.com/u/{gid}?s=160&v=4",
                headers={"User-Agent": "zcash-irondevs"},
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
        except Exception:
            continue
        if _is_placeholder_avatar(data):
            continue  # GitHub identicon / solid placeholder: let the node be a colored sphere
        # extension must match the real bytes or a static server sends the wrong MIME
        ext = "jpg" if data[:3] == b"\xff\xd8\xff" else "png"
        fn = f"{gid}.{ext}"
        (av_dir / fn).write_bytes(data)
        manifest[cid] = fn
        fetched += 1

    manifest_file.write_text(json.dumps(manifest, indent=0))
    print(f"✓ avatars: {len(manifest)} people mapped ({fetched} newly downloaded)")
    return manifest


def load_manifest(web_dir: Path) -> dict[str, str]:
    f = web_dir / "avatars" / "manifest.json"
    return json.loads(f.read_text()) if f.exists() else {}
