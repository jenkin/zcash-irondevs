"""Per-repo overrides for known data-quality issues in a specific mirror.

Not a general mechanism for filtering out contributors -- the one entry
below exists because `zcash/zcash` was forked from Bitcoin Core, so its git
log includes roughly five thousand commits from 2009-2013 authored by
Bitcoin Core contributors who never touched Zcash. Every one of those
commits predates the fork by years; counting their authors as part of "who
built Zcash" would be wrong, not just noisy. The floor below is this
project's own first milestone (the Zerocash paper, see milestones.py), which
also happens to be where real Zcash-specific work is actually visible in
this repo's history (Ian Miers' and Daira Hopwood's earliest
zerocash-integration commits land within days of it).
"""

from __future__ import annotations

from datetime import datetime, timezone

HISTORY_FLOOR: dict[str, datetime] = {
    "zcash/zcash": datetime(2014, 5, 18, tzinfo=timezone.utc),
}
