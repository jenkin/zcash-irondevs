"""zcash/zcash was forked from Bitcoin Core, so its git log runs years
before Zcash existed. The history floor in repo_config.py exists to exclude
that inherited, unrelated history -- and it's deliberately pinned to this
project's own first milestone (the Zerocash paper) rather than a second,
independent date, so the two can't silently drift apart.
"""

from __future__ import annotations

from pipeline.milestones import MILESTONES
from pipeline.repo_config import HISTORY_FLOOR


def test_zcash_zcash_history_floor_matches_the_zerocash_paper_milestone():
    assert HISTORY_FLOOR["zcash/zcash"] == MILESTONES[0]["date"]
    assert MILESTONES[0]["name"] == "Zerocash paper"
