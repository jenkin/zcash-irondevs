"""Author deduplication.

A single human contributor commits under many identities: different emails
(work, personal, `noreply`), spelling variants of their name, machine accounts.
We collapse those into stable *canonical* identities so the co-authorship
network reflects people, not addresses.

Approach: union-find over the observed ``(name, email)`` pairs.
    - Two identities merge if they share a normalized email, OR
    - they share a normalized display name (and neither name is generic).

Bot / automation identities are detected and tagged (not dropped) so the
visualization can filter them without losing the data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Emails that GitHub issues for privacy, the numeric+username prefix is the
# stable identifier, so we normalize to it rather than the raw address.
_GH_NOREPLY = re.compile(r"^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$", re.I)

_BOT_PATTERNS = (
    "dependabot",
    "github-actions",
    "github-action",
    "renovate",
    "greenkeeper",
    "mergify",
    "semantic-release",
    "[bot]",
    "actions-user",
    "web-flow", # GitHub's merge-commit committer
    "copilot",  # Copilot Autofix / coding-agent commits
)

# Names too generic to be a reliable merge key on their own.
_GENERIC_NAMES = {"", "root", "admin", "user", "unknown", "none", "your name"}


def normalize_email(email: str | None) -> str:
    email = (email or "").strip().lower()
    m = _GH_NOREPLY.match(email)
    if m:
        return f"{m.group(1)}@users.noreply.github.com"
    return email


def normalize_name(name: str | None) -> str:
    name = (name or "").strip().lower()
    # collapse internal whitespace
    return re.sub(r"\s+", " ", name)


def is_bot(name: str | None, email: str | None) -> bool:
    blob = f"{(name or '').lower()} {(email or '').lower()}"
    return any(p in blob for p in _BOT_PATTERNS)


@dataclass
class Identity:
    """A resolved, canonical contributor."""

    id: str
    name: str
    emails: set[str] = field(default_factory=set)
    aliases: set[str] = field(default_factory=set)
    is_bot: bool = False


class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[str, str] = {}

    def add(self, x: str) -> None:
        self._parent.setdefault(x, x)

    def find(self, x: str) -> str:
        self.add(x)
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        # path compression
        while self._parent[x] != root:
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # keep the lexicographically smaller root for determinism
            lo, hi = sorted((ra, rb))
            self._parent[hi] = lo


class IdentityResolver:
    """Builds and applies a mapping from raw ``(name, email)`` to canonical id."""

    def __init__(self) -> None:
        self._uf = _UnionFind()
        # observed raw identities, keyed by a stable token
        self._seen: dict[str, tuple[str, str]] = {}
        self._by_email: dict[str, str] = {}
        self._by_name: dict[str, str] = {}
        self._token_cid: dict[str, str] = {}

    @staticmethod
    def _token(name: str, email: str) -> str:
        return f"{normalize_name(name)}\x00{normalize_email(email)}"

    def observe(self, name: str | None, email: str | None) -> None:
        name = (name or "").strip()
        email = (email or "").strip()
        tok = self._token(name, email)
        if tok in self._seen:
            return
        self._seen[tok] = (name, email)
        self._uf.add(tok)

        nemail = normalize_email(email)
        nname = normalize_name(name)

        if nemail:
            if nemail in self._by_email:
                self._uf.union(tok, self._by_email[nemail])
            else:
                self._by_email[nemail] = tok

        # Merge on name only when it's specific enough to trust across thousands of
        # contributors: require a full "First Last" (a space) and real length, so a
        # shared common first name ("alex", "chris") can't fuse distinct people.
        if nname and nname not in _GENERIC_NAMES and " " in nname and len(nname) > 5:
            if nname in self._by_name:
                self._uf.union(tok, self._by_name[nname])
            else:
                self._by_name[nname] = tok

    def resolve(self) -> dict[str, Identity]:
        """Return canonical-id -> Identity, after all observe() calls.

        Also memoizes a raw-token -> canonical-id map so key_for() is O(1).
        """
        clusters: dict[str, list[str]] = {}
        token_root: dict[str, str] = {}
        for tok in self._seen:
            root = self._uf.find(tok)
            token_root[tok] = root
            clusters.setdefault(root, []).append(tok)

        identities: dict[str, Identity] = {}
        root_cid: dict[str, str] = {}
        for root, toks in clusters.items():
            members = [self._seen[t] for t in toks]
            emails = {normalize_email(e) for _, e in members if e}
            names = [n for n, _ in members if n.strip()]
            # display name: most frequent non-empty raw name, tie-broken by length
            display = _pick_display_name(names) or (sorted(emails)[0] if emails else root)
            cid = _canonical_id(emails, display)
            root_cid[root] = cid
            identities[cid] = Identity(
                id=cid,
                name=display,
                emails=emails,
                aliases=set(names),
                is_bot=any(is_bot(n, e) for n, e in members),
            )
        self._token_cid = {tok: root_cid[r] for tok, r in token_root.items()}
        return identities

    def key_for(self, name: str | None, email: str | None) -> str:
        """Canonical id for a raw identity (must be called after resolve())."""
        tok = self._token((name or "").strip(), (email or "").strip())
        return self._token_cid.get(tok, normalize_email(email) or normalize_name(name) or tok)


def _pick_display_name(names: list[str]) -> str:
    if not names:
        return ""
    counts: dict[str, int] = {}
    for n in names:
        counts[n] = counts.get(n, 0) + 1
    # most frequent, then longest, then alphabetical, all deterministic
    return sorted(names, key=lambda n: (-counts[n], -len(n), n))[0]


def _canonical_id(emails: set[str], display: str) -> str:
    """Stable id independent of iteration order."""
    if emails:
        return sorted(emails)[0]
    return normalize_name(display) or "unknown"
