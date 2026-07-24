"""Zcash protocol upgrade dates -- the natural checkpoints for time slicing."""

from __future__ import annotations

from datetime import datetime, timezone


def _d(iso_date: str) -> datetime:
    return datetime.fromisoformat(iso_date).replace(tzinfo=timezone.utc)


MILESTONES: list[dict[str, str | datetime]] = [
    {"name": "Zerocash paper", "date": _d("2014-05-18")},
    {"name": "Sprout launch", "date": _d("2016-10-28")},
    {"name": "Overwinter", "date": _d("2018-06-26")},
    {"name": "Sapling", "date": _d("2018-10-28")},
    {"name": "Blossom", "date": _d("2019-12-11")},
    {"name": "Heartwood", "date": _d("2020-07-16")},
    {"name": "Canopy", "date": _d("2020-11-18")},
    {"name": "NU5 / Orchard", "date": _d("2022-05-31")},
    {"name": "NU6", "date": _d("2024-11-23")},
    {"name": "NU6.1", "date": _d("2025-06-30")},
    {"name": "Ironwood", "date": _d("2026-07-28")},
]
