"""Small builders for engine tests. Times are given in site-local time and converted to UTC."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.engine.params import HOLIDAYS
from app.engine.types import (
    Adjustment,
    Attest,
    Employee,
    EmployeeWeek,
    Evidence,
    Punch,
    Schedule,
    Site,
)

SITES = {
    "US-CA": Site("FRE", "America/Los_Angeles", "US-CA", "USD"),
    "US-TX": Site("AUS", "America/Chicago", "US-TX", "USD"),
    "IN-KA": Site("BLR", "Asia/Kolkata", "IN-KA", "INR"),
}
WEEK = date(2026, 11, 2)


def t(juris: str, value: str) -> datetime:
    """'2026-11-03 07:00' local -> aware UTC."""
    tz = ZoneInfo(SITES[juris].timezone)
    return datetime.strptime(value, "%Y-%m-%d %H:%M").replace(tzinfo=tz).astimezone(UTC)


class W:
    """Fluent builder for an EmployeeWeek."""

    def __init__(
        self,
        juris: str = "US-CA",
        exempt: bool = False,
        role: str = "picker",
        emp_id: str = "E1",
        now: str = "2026-11-06 11:00",
        rate: float = 20.0,
    ) -> None:
        self.j = juris
        self.emp = Employee(emp_id, f"Emp {emp_id}", SITES[juris], role, exempt, rate)
        self.now = t(juris, now)
        self.punches: list[Punch] = []
        self.scheds: list[Schedule] = []
        self.ev: list[Evidence] = []
        self.adj: list[Adjustment] = []
        self.att: list[Attest] = []
        self.n = 0

    def _id(self, p: str) -> str:
        self.n += 1
        return f"{p}{self.n}"

    def sched(self, start: str, end: str, meal: int = 30) -> W:
        self.scheds.append(
            Schedule(self._id("S"), self.emp.id, t(self.j, start), t(self.j, end), meal)
        )
        return self

    def punch(self, kind: str, at: str) -> W:
        self.punches.append(Punch(self._id("P"), kind, t(self.j, at)))
        return self

    def shift(
        self,
        day: str,
        start: str,
        end: str,
        meal: tuple[str, str] | None = ("11:00", "11:30"),
        end_day: str | None = None,
        schedule: bool = True,
    ) -> W:
        if schedule:
            self.sched(f"{day} {start}", f"{end_day or day} {end}")
        self.punch("IN", f"{day} {start}")
        if meal:
            self.punch("MEAL_START", f"{day} {meal[0]}").punch("MEAL_END", f"{day} {meal[1]}")
        return self.punch("OUT", f"{end_day or day} {end}")

    def evidence(self, kind: str, at: str) -> W:
        self.ev.append(Evidence(self._id("EV"), kind, t(self.j, at), "Door"))
        return self

    def adjust(self, kind: str, d: date, rule: str, hours: float = 0.0) -> W:
        self.adj.append(Adjustment(kind, d, hours, rule))
        return self

    def attest(self, rule: str, d: date, at: str) -> W:
        self.att.append(Attest(self._id("AT"), rule, d, t(self.j, at)))
        return self

    def build(self) -> EmployeeWeek:
        return EmployeeWeek(
            self.emp,
            WEEK,
            self.now,
            tuple(self.punches),
            tuple(self.scheds),
            tuple(self.ev),
            tuple(self.adj),
            tuple(self.att),
            HOLIDAYS.get(self.j, frozenset()),
        )
