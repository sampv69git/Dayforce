"""Jurisdiction parameters derived from the fictional policy pack v2026.2."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class PolicyParams:
    jurisdiction: str
    weekly_ot_hours: float
    daily_ot_hours: float | None
    daily_dt_hours: float | None
    ot_multiplier: float
    dt_multiplier: float
    meal_mode: str  # "ca" | "handbook" | "continuous"
    meal_after_hours: float
    meal_min_minutes: float
    second_meal_after_hours: float | None
    rest_min_hours: float
    max_consecutive_days: int
    meal_premium: bool
    holiday_multiplier: float
    tardy_grace_minutes: float = 7.0
    missing_out_grace_minutes: float = 60.0
    duplicate_window_minutes: float = 10.0
    span_max_hours: float = 16.0
    evidence_conflict_minutes: float = 60.0


PARAMS: dict[str, PolicyParams] = {
    "US-CA": PolicyParams(
        jurisdiction="US-CA",
        weekly_ot_hours=40,
        daily_ot_hours=8,
        daily_dt_hours=12,
        ot_multiplier=1.5,
        dt_multiplier=2.0,
        meal_mode="ca",
        meal_after_hours=5,
        meal_min_minutes=30,
        second_meal_after_hours=10,
        rest_min_hours=10,
        max_consecutive_days=6,
        meal_premium=True,
        holiday_multiplier=1.0,
    ),
    "US-TX": PolicyParams(
        jurisdiction="US-TX",
        weekly_ot_hours=40,
        daily_ot_hours=None,
        daily_dt_hours=None,
        ot_multiplier=1.5,
        dt_multiplier=2.0,
        meal_mode="handbook",
        meal_after_hours=6,
        meal_min_minutes=30,
        second_meal_after_hours=None,
        rest_min_hours=10,
        max_consecutive_days=6,
        meal_premium=False,
        holiday_multiplier=1.0,
    ),
    "IN-KA": PolicyParams(
        jurisdiction="IN-KA",
        weekly_ot_hours=48,
        daily_ot_hours=9,
        daily_dt_hours=None,
        ot_multiplier=2.0,
        dt_multiplier=2.0,
        meal_mode="continuous",
        meal_after_hours=5,
        meal_min_minutes=30,
        second_meal_after_hours=None,
        rest_min_hours=11,
        max_consecutive_days=6,
        meal_premium=False,
        holiday_multiplier=2.0,
    ),
}

HOLIDAYS: dict[str, frozenset[date]] = {
    "IN-KA": frozenset({date(2026, 11, 1), date(2026, 11, 8)}),
    "US-CA": frozenset(),
    "US-TX": frozenset(),
}


def params_for(jurisdiction: str) -> PolicyParams:
    return PARAMS[jurisdiction]
