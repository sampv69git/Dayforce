"""Load the synthetic dataset and policy pack into the database.

Usage: `uv run python -m app.seed.load --reset`
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import Base, get_engine, session_scope
from app.domain import models as m
from app.observability.logging import configure_logging, get_logger
from app.retrieval.corpus import load_clauses
from app.seed.generator import Dataset, build

log = get_logger(__name__)


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(tzinfo=None)


def clear_all(session: Session) -> None:
    """Delete every row (children first) so a reseed starts clean."""
    for table in reversed(Base.metadata.sorted_tables):
        if table.name == "alembic_version":
            continue
        session.execute(delete(table))


def load_policy(session: Session) -> int:
    from app.retrieval.embed import embed_texts

    clauses = load_clauses()
    vectors = embed_texts([f"{c.title}. {c.text}" for c in clauses])
    for c, vec in zip(clauses, vectors, strict=True):
        session.merge(
            m.PolicyClause(
                clause_id=c.clause_id,
                version=c.version,
                document_id=c.document_id,
                document_title=c.document_title,
                section=c.section,
                title=c.title,
                text=c.text,
                jurisdictions=list(c.jurisdictions),
                employee_classes=list(c.employee_classes),
                effective_from=c.effective_from,
                effective_to=c.effective_to,
                precedence=c.precedence,
                rule_ids=list(c.rule_ids),
                embedding=vec,
            )
        )
    return len(clauses)


def load_dataset(session: Session, ds: Dataset) -> None:
    session.add_all(m.Site(**vars(s)) for s in ds.sites)
    session.flush()
    session.add_all(m.Employee(**vars(e)) for e in ds.employees)
    session.add_all(m.User(**vars(u)) for u in ds.users)
    session.flush()
    session.add_all(
        m.ShiftSchedule(
            id=s.id,
            employee_id=s.employee_id,
            start_utc=_naive(s.start_utc),
            end_utc=_naive(s.end_utc),
            meal_minutes=s.meal_minutes,
        )
        for s in ds.schedules
    )
    session.add_all(
        m.Punch(
            id=p.id,
            employee_id=p.employee_id,
            type=p.type,
            at_utc=_naive(p.at_utc),
            source=p.source,
        )
        for p in ds.punches
    )
    session.add_all(
        m.EvidenceEvent(
            id=e.id,
            employee_id=e.employee_id,
            kind=e.kind,
            at_utc=_naive(e.at_utc),
            location=e.location,
        )
        for e in ds.evidence
    )
    session.add_all(
        m.EmployeeNote(
            id=n.id,
            employee_id=n.employee_id,
            work_date=n.work_date,
            text=n.text,
            created_at=_naive(n.created_at),
        )
        for n in ds.notes
    )


def seed(reset: bool = True, seed_value: int | None = None) -> dict[str, int]:
    """Reset (optionally) and load everything, then run detection and seed demo state."""
    from app.config import get_settings

    get_engine()
    ds = build(seed_value or get_settings().seed)
    with session_scope() as s:
        if reset:
            clear_all(s)
        n_clauses = load_policy(s)
        load_dataset(s, ds)
    from app.seed.post import after_seed

    after_seed(ds)
    with session_scope() as s:
        counts = {
            "employees": len(s.scalars(select(m.Employee.id)).all()),
            "punches": len(s.scalars(select(m.Punch.id)).all()),
            "clauses": n_clauses,
            "exceptions": len(s.scalars(select(m.ExceptionRecord.id)).all()),
        }
    log.info("seed_complete", **counts)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Countersign demo data")
    parser.add_argument("--reset", action="store_true", help="delete existing data first")
    args = parser.parse_args()
    configure_logging("INFO")
    print(seed(reset=args.reset))


if __name__ == "__main__":
    main()
