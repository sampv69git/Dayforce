"""Policy pack loading. The YAML files in `backend/policy/` are the single source of truth."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

import yaml

from app.config import BACKEND_DIR

POLICY_DIR = Path(BACKEND_DIR) / "policy"
POLICY_FILES = ("handbook.yaml", "california.yaml", "bengaluru.yaml")


@dataclass(frozen=True)
class Clause:
    clause_id: str
    version: str
    document_id: str
    document_title: str
    section: str
    title: str
    text: str
    jurisdictions: tuple[str, ...]
    employee_classes: tuple[str, ...]
    effective_from: date
    effective_to: date | None
    precedence: str
    rule_ids: tuple[str, ...] = field(default_factory=tuple)

    def applies(self, jurisdiction: str, employee_class: str, on: date) -> bool:
        """True when the clause governs this jurisdiction, employee class, and date."""
        juris_ok = "*" in self.jurisdictions or jurisdiction in self.jurisdictions
        class_ok = not self.employee_classes or employee_class in self.employee_classes
        date_ok = self.effective_from <= on and (
            self.effective_to is None or on <= self.effective_to
        )
        return juris_ok and class_ok and date_ok


@lru_cache
def load_clauses() -> tuple[Clause, ...]:
    """Load all clauses from the policy pack, in document order."""
    out: list[Clause] = []
    for name in POLICY_FILES:
        doc = yaml.safe_load((POLICY_DIR / name).read_text(encoding="utf-8"))
        for c in doc["clauses"]:
            out.append(
                Clause(
                    clause_id=c["id"],
                    version=str(doc["version"]),
                    document_id=doc["document_id"],
                    document_title=doc["title"],
                    section=c["section"],
                    title=c["title"],
                    text=" ".join(str(c["text"]).split()),
                    jurisdictions=tuple(doc["jurisdictions"]),
                    employee_classes=tuple(c.get("classes", [])),
                    effective_from=c.get("effective_from", doc["effective_from"]),
                    effective_to=c.get("effective_to"),
                    precedence=c.get("precedence", "base"),
                    rule_ids=tuple(c.get("rules", [])),
                )
            )
    return tuple(out)


def clause_index() -> dict[str, Clause]:
    return {c.clause_id: c for c in load_clauses()}
