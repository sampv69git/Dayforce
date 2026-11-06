"""Plain data types for the pure rules engine. All datetimes are timezone-aware UTC."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Site:
    code: str
    timezone: str
    jurisdiction: str
    currency: str

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@dataclass(frozen=True)
class Employee:
    id: str
    name: str
    site: Site
    role: str
    exempt: bool
    rate: float

    @property
    def employee_class(self) -> str:
        return "exempt" if self.exempt else "non_exempt"


@dataclass(frozen=True)
class Punch:
    id: str
    type: str  # IN | OUT | MEAL_START | MEAL_END
    at: datetime
    source: str = "clock"


@dataclass(frozen=True)
class Schedule:
    id: str
    employee_id: str
    start: datetime
    end: datetime
    meal_minutes: int = 30

    @property
    def planned_hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600 - self.meal_minutes / 60


@dataclass(frozen=True)
class Evidence:
    id: str
    kind: str  # badge_entry | badge_exit | scanner_activity
    at: datetime
    location: str | None = None


@dataclass(frozen=True)
class Adjustment:
    """A human-approved pay or acknowledgement record that resolves a rule on a date."""

    kind: str  # meal_premium | rest_premium | holiday_premium | ot_approval | acknowledged | unscheduled_ok
    work_date: date
    hours: float = 0.0
    rule_id: str | None = None


@dataclass(frozen=True)
class Attest:
    id: str
    rule_id: str
    work_date: date
    at: datetime
    note: str | None = None


@dataclass(frozen=True)
class EmployeeWeek:
    """Everything the engine needs to evaluate one employee's current workweek."""

    employee: Employee
    week_start: date
    now: datetime
    punches: tuple[Punch, ...]
    schedules: tuple[Schedule, ...]
    evidence: tuple[Evidence, ...] = ()
    adjustments: tuple[Adjustment, ...] = ()
    attestations: tuple[Attest, ...] = ()
    holidays: frozenset[date] = frozenset()
    notes: tuple[tuple[date, str], ...] = ()

    @property
    def week_end(self) -> date:
        return self.week_start + timedelta(days=6)

    @property
    def tz(self) -> ZoneInfo:
        return self.employee.site.tz

    def local(self, dt: datetime) -> datetime:
        return dt.astimezone(self.tz)

    def local_date(self, dt: datetime) -> date:
        return self.local(dt).date()

    def in_week(self, d: date) -> bool:
        return self.week_start <= d <= self.week_end

    def with_(self, **changes: Any) -> EmployeeWeek:
        return replace(self, **changes)


@dataclass(frozen=True)
class Meal:
    start: Punch
    end: Punch | None

    @property
    def minutes(self) -> float | None:
        if self.end is None:
            return None
        return (self.end.at - self.start.at).total_seconds() / 60


@dataclass(frozen=True)
class Shift:
    start: Punch | None
    end: Punch | None
    meals: tuple[Meal, ...]
    schedule: Schedule | None
    work_date: date
    in_progress: bool = False

    @property
    def complete(self) -> bool:
        return self.start is not None and self.end is not None

    @property
    def elapsed_hours(self) -> float | None:
        if self.start is None or self.end is None:
            return None
        return (self.end.at - self.start.at).total_seconds() / 3600

    @property
    def meal_minutes(self) -> float:
        return sum(m.minutes or 0.0 for m in self.meals)

    @property
    def worked_hours(self) -> float | None:
        elapsed = self.elapsed_hours
        if elapsed is None:
            return None
        return max(0.0, elapsed - self.meal_minutes / 60)

    @property
    def key_punch_id(self) -> str:
        p = self.start or self.end
        return p.id if p else "none"


@dataclass(frozen=True)
class Finding:
    rule_id: str
    work_date: date
    discriminator: str
    evidence: dict[str, Any] = field(default_factory=dict)
    summary: str = ""


@dataclass(frozen=True)
class Op:
    """A proposed timecard or schedule operation (mirrors contracts.Operation)."""

    op: str
    punch_type: str | None = None
    at: str | None = None  # site-local "YYYY-MM-DDTHH:MM"
    punch_id: str | None = None
    premium_kind: str | None = None
    hours: float | None = None
    shift_id: str | None = None
    to_employee_id: str | None = None
    evidence_ids: tuple[str, ...] = ()
