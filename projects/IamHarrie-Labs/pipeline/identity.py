"""Author deduplication: union-find over emails and normalized name spellings.

The same human shows up under many identities across a decade of commits:
work/personal emails, noreply GitHub addresses, capitalization drift, CI bots
committing "on behalf of" a human co-author, etc. We merge what we can prove
is the same person and tag (never drop) anything that looks automated.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

_BOT_PATTERNS = re.compile(
    r"(\[bot\]$|-bot$|^bot-|dependabot|renovate|github-actions|greenkeeper|snyk-bot|"
    r"semantic-release|imgbot|allcontributors|codecov|weblate|transifex|mergify|"
    r"^zkbot$)",
    re.IGNORECASE,
)

_NOREPLY = re.compile(r"^(\d+\+)?([^@]+)@users\.noreply\.github\.com$", re.IGNORECASE)

_NAME_STRIP = re.compile(r"[^a-z0-9]+")

# A real GitHub username: alphanumeric, single hyphens only, no leading or
# trailing hyphen, up to 39 characters. Needed because `github_login` below
# infers a login from "any stored email with no @ in it" -- normally safe,
# since normalize_email only produces such a string by successfully
# stripping a real `@users.noreply.github.com` suffix, but a malformed
# commit trailer missing its own "@" (a real, if rare, typo -- e.g.
# "Co-Authored-By: Name <login.users.noreply.github.com>") slips through
# normalize_email untouched, and would otherwise be mistaken for a verified
# login instead of the garbled address it actually is.
_GITHUB_LOGIN = re.compile(r"^[a-z0-9](?:-?[a-z0-9]){0,38}$", re.IGNORECASE)

# AI coding assistants and GitHub's own automated actors show up as commit
# co-authors or committers on otherwise ordinary human-authored work (a
# "Co-Authored-By: Claude Opus <noreply@anthropic.com>" trailer, or GitHub's
# own "GitHub <noreply@github.com>" web-UI merge committer). None of these
# use a [bot]-suffixed name, so the pattern above doesn't catch them, and
# without this they're indistinguishable in the graph from a real person --
# accumulating co-authorship credit that actually belongs to whichever human
# was directing the tool. These are specific, well-known addresses (not a
# broad domain match), so a real contributor's own email can't collide with
# them.
_AI_COAUTHOR_EMAILS = {
    "noreply@github.com",  # GitHub's own web-UI merge/edit committer identity
    "noreply@anthropic.com",  # Claude
    "noreply@openai.com",  # Codex / GPT
    "codex@openai.com",  # Codex / GPT
    "noreply@google.com",  # Gemini
    "release-tests-no-reply@zfnd.org",  # Zcash Foundation's automated release test runner
}
_AI_COAUTHOR_LOGINS = {"copilot"}  # GitHub Copilot's users.noreply.github.com login


def normalize_name(name: str) -> str:
    """Fold a display name to a comparable key: strip accents, case, punctuation."""
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _NAME_STRIP.sub("", ascii_only.lower())


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    m = _NOREPLY.match(email)
    if m:
        return m.group(2)
    return email


def is_bot(name: str, email: str) -> bool:
    normalized = normalize_email(email)
    if normalized in _AI_COAUTHOR_EMAILS or normalized in _AI_COAUTHOR_LOGINS:
        return True
    return bool(_BOT_PATTERNS.search(name) or _BOT_PATTERNS.search(email))


class UnionFind:
    def __init__(self) -> None:
        self._parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self._parent.setdefault(x, x)
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[x] != root:
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self._parent[rb] = ra


@dataclass
class Identity:
    """A resolved, deduplicated author."""

    canonical_id: str
    display_name: str
    emails: set[str] = field(default_factory=set)
    aliases: set[str] = field(default_factory=set)
    is_bot: bool = False
    commit_count: int = 0

    @property
    def github_login(self) -> str | None:
        """A real GitHub username, if this person ever committed with their
        `users.noreply.github.com` address -- `normalize_email` reduces that
        down to the bare login, so anything in `emails` with no "@" already
        *is* one (no separate bookkeeping needed, and no guessing: this is
        only ever set from an address GitHub itself generated for that
        account)."""
        for e in self.emails:
            if "@" not in e and _GITHUB_LOGIN.match(e):
                return e
        return None


class IdentityResolver:
    """Accumulates (name, email) sightings and resolves them to `Identity`s.

    Two sightings are merged when they share a normalized email OR a
    normalized display name -- transitively, via union-find, so "Jane Doe
    <jane@work.com>" and "jdoe <jane@personal.com>" merge through any commit
    that used "Jane Doe <jane@personal.com>" as a bridge.
    """

    def __init__(self) -> None:
        self._uf = UnionFind()
        self._sightings: dict[str, tuple[str, str, bool]] = {}
        self._counts: dict[str, int] = {}

    @staticmethod
    def _keys(name: str, email: str) -> list[str]:
        name = name.strip() or "unknown"
        email = normalize_email(email)
        name_key = f"n:{normalize_name(name)}" if normalize_name(name) else None
        email_key = f"e:{email}" if email else None
        keys = [k for k in (name_key, email_key) if k]
        return keys or ["n:unknown"]

    def register(self, name: str, email: str) -> None:
        """Phase 1: record a sighting and union its keys. Union-find roots can
        keep shifting as later sightings merge previously-separate groups, so
        nothing that depends on a *stable* id (contribution attribution,
        counts) may be computed yet -- see `canonical()`."""
        name = name.strip() or "unknown"
        email = normalize_email(email)
        keys = self._keys(name, email)
        primary = keys[0]
        for k in keys:
            self._sightings.setdefault(k, (name, email, is_bot(name, email)))
            self._uf.union(primary, k)

    def canonical(self, name: str, email: str) -> str:
        """Phase 2: look up the *final* root for a sighting, once every
        `register()` call has already happened. Also tallies the commit count
        against that final root, so counts can't fragment across stale roots
        either."""
        primary = self._keys(name, email)[0]
        root = self._uf.find(primary)
        self._counts[root] = self._counts.get(root, 0) + 1
        return root

    def observe(self, name: str, email: str) -> str:
        """Convenience one-shot register+canonical for callers that only make
        a single pass (fine as long as nothing else observes new aliases for
        the same person afterward -- see `register`/`canonical` for the safe
        two-phase version used when the whole corpus is known up front)."""
        self.register(name, email)
        return self.canonical(name, email)

    def resolve(self) -> dict[str, Identity]:
        groups: dict[str, list[str]] = {}
        for key in self._sightings:
            groups.setdefault(self._uf.find(key), []).append(key)

        identities: dict[str, Identity] = {}
        for root, keys in groups.items():
            emails = {self._sightings[k][1] for k in keys if k.startswith("e:")}
            names = [self._sightings[k][0] for k in keys if k.startswith("n:")]
            bot = any(self._sightings[k][2] for k in keys)
            # Prefer the longest, most "real"-looking display name -- but
            # never one containing a newline or other control character.
            # "Longest wins" already shipped one real bug: a commit message
            # trailer parsing mistake (fixed in mine.py) once produced a
            # sighting whose "name" was actually two different people's
            # trailers concatenated across a newline, and being unusually
            # long, it won the max() over the real, clean name entirely.
            clean_names = [n for n in names if n.isprintable()]
            display = max(clean_names or names, key=len) if (clean_names or names) else (next(iter(emails), "unknown"))
            identities[root] = Identity(
                canonical_id=root,
                display_name=display,
                emails=emails,
                aliases=set(names),
                is_bot=bot,
                commit_count=self._counts.get(root, 0),
            )
        return identities
