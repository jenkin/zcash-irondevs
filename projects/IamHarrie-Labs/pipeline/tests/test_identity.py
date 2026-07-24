"""Identity resolution is the pipeline's riskiest module: a bug here doesn't
crash anything, it silently splits or merges real people, and that's exactly
the kind of failure that stayed hidden for a while earlier in this project's
history (see the union-find staleness bug in graph.py's history). These tests
exist to catch a regression there before it ships quietly again.
"""

from __future__ import annotations

from pipeline.identity import IdentityResolver, is_bot, normalize_email, normalize_name


def test_normalize_name_folds_accents_case_and_punctuation():
    assert normalize_name("Daira-Emma Hopwood") == normalize_name("daira emma hopwood")
    assert normalize_name("François Garillot") == normalize_name("francois garillot")


def test_normalize_email_reduces_github_noreply_to_bare_login():
    assert normalize_email("12345+octocat@users.noreply.github.com") == "octocat"
    assert normalize_email("Octocat@USERS.NOREPLY.GITHUB.COM") == "octocat"


def test_normalize_email_leaves_ordinary_addresses_alone():
    assert normalize_email("Jane@Example.COM") == "jane@example.com"


def test_is_bot_matches_known_automation_suffixes():
    assert is_bot("dependabot[bot]", "support@github.com")
    assert is_bot("renovate-bot", "bot@renovateapp.com")
    assert not is_bot("Jane Doe", "jane@example.com")


def test_is_bot_matches_zkbot_by_exact_name():
    # Electric Coin Company's own automated deploy/auto-merge account for
    # zcashd, real commits like "deploy: <hash>" and "Auto merge of #N" --
    # doesn't end in "-bot" or "[bot]", so the general suffix patterns above
    # miss it without an exact-name rule of its own.
    assert is_bot("zkbot", "zkbot@users.noreply.github.com")
    assert is_bot("zkbot", "sysadmin@z.cash")
    assert not is_bot("zkbotanist", "someone@example.com")


def test_is_bot_flags_known_ai_coauthor_addresses_not_names():
    # The signal is the specific, well-known address an AI tool's
    # Co-Authored-By trailer uses -- not the display name, since a real
    # human could plausibly be named "Claude" or "Gemini".
    assert is_bot("Claude Opus 4.6 (1M context)", "noreply@anthropic.com")
    assert is_bot("OpenAI GPT-5 Codex", "noreply@openai.com")
    assert is_bot("Gemini 3 Pro", "noreply@google.com")
    assert is_bot("GitHub", "noreply@github.com")
    assert is_bot("Copilot Autofix powered by AI", "175728472+Copilot@users.noreply.github.com")
    assert not is_bot("Claude Debussy", "claude.debussy@example.com")


def test_resolver_merges_aliases_that_bridge_through_a_shared_commit():
    resolver = IdentityResolver()
    # Two email addresses for the same person, bridged by one commit that
    # used a third (name, email) pairing linking both.
    resolver.register("Jane Doe", "jane@work.com")
    resolver.register("Jane Doe", "jane@personal.com")
    resolver.register("jdoe", "jane@personal.com")

    id_work = resolver.canonical("Jane Doe", "jane@work.com")
    id_personal = resolver.canonical("jdoe", "jane@personal.com")
    assert id_work == id_personal

    identities = resolver.resolve()
    merged = identities[id_work]
    assert merged.aliases >= {"Jane Doe", "jdoe"}
    assert merged.emails >= {"jane@work.com", "jane@personal.com"}


def test_resolver_two_phase_handles_late_arriving_bridge():
    """A later commit can reveal that two previously-separate aliases are
    the same person -- register() must see every commit before canonical()
    is trusted, or the id assigned to an early commit goes stale."""
    resolver = IdentityResolver()
    commits = [
        ("Jane Doe", "jane@work.com"),
        ("jdoe", "jane@personal.com"),
        ("Jane Doe", "jane@personal.com"),  # the bridge, arrives last
    ]
    for name, email in commits:
        resolver.register(name, email)

    ids = {resolver.canonical(name, email) for name, email in commits}
    assert len(ids) == 1


def test_resolver_keeps_distinct_people_separate():
    resolver = IdentityResolver()
    resolver.register("Jane Doe", "jane@example.com")
    resolver.register("John Smith", "john@example.com")

    identities = resolver.resolve()
    assert len(identities) == 2


def test_github_login_only_set_from_a_real_noreply_address():
    resolver = IdentityResolver()
    resolver.register("octocat", "12345+octocat@users.noreply.github.com")
    resolver.canonical("octocat", "12345+octocat@users.noreply.github.com")
    identity = next(iter(resolver.resolve().values()))
    assert identity.github_login == "octocat"

    resolver2 = IdentityResolver()
    resolver2.register("Jane Doe", "jane@example.com")
    resolver2.canonical("Jane Doe", "jane@example.com")
    identity2 = next(iter(resolver2.resolve().values()))
    assert identity2.github_login is None


def test_github_login_ignores_a_malformed_noreply_trailer_missing_its_at_sign():
    # A real, if rare, typo in an actual commit: a Co-Authored-By trailer
    # missing the "@" before "users.noreply.github.com". normalize_email
    # can't recognize it as a noreply address (the regex requires the "@"),
    # so it passes through untouched -- and untouched, it also has no "@" in
    # it, which would otherwise look exactly like a real bare login.
    resolver = IdentityResolver()
    resolver.register("Josh Cincinnati", "acityinohio@users.noreply.github.com")
    resolver.register("Josh Cincinnati", "acityinohio.users.noreply.github.com")
    resolver.canonical("Josh Cincinnati", "acityinohio@users.noreply.github.com")
    resolver.canonical("Josh Cincinnati", "acityinohio.users.noreply.github.com")

    identity = next(iter(resolver.resolve().values()))
    assert identity.github_login == "acityinohio"


def test_display_name_never_picks_a_name_containing_a_newline():
    # A real bug that shipped once: a commit trailer parsing mistake
    # (fixed in mine.py) produced a sighting whose "name" was actually two
    # people's trailers concatenated across a newline, and being unusually
    # long, it won "longest name wins" over the real, clean name outright.
    # This is the safety net in identity.py itself, independent of whether
    # the parser that produced the sighting is ever fixed correctly.
    resolver = IdentityResolver()
    resolver.register("Daira Hopwood", "daira@jacaranda.org")
    resolver.register("Jeff Liang\nSigned-off-by: Daira Hopwood", "daira@jacaranda.org")
    resolver.canonical("Daira Hopwood", "daira@jacaranda.org")
    resolver.canonical("Jeff Liang\nSigned-off-by: Daira Hopwood", "daira@jacaranda.org")

    identity = next(iter(resolver.resolve().values()))
    assert identity.display_name == "Daira Hopwood"
