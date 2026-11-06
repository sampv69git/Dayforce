"""Hash-chained, append-only audit log (HARNESS.md section 9)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.models import AuditEvent

GENESIS = "0" * 64


def _default(o: Any) -> str:
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    return str(o)


def canonical(event: dict[str, Any]) -> str:
    return json.dumps(event, sort_keys=True, separators=(",", ":"), default=_default)


def compute_hash(prev_hash: str, body: dict[str, Any]) -> str:
    return hashlib.sha256((prev_hash + canonical(body)).encode()).hexdigest()


def _body(e: AuditEvent) -> dict[str, Any]:
    return {
        "seq": e.seq,
        "occurred_at": e.occurred_at.replace(microsecond=0).isoformat(),
        "actor_id": e.actor_id,
        "actor_role": e.actor_role,
        "event_type": e.event_type,
        "entity_type": e.entity_type,
        "entity_id": e.entity_id,
        "payload": e.payload,
    }


def append(
    session: Session,
    *,
    actor_id: str,
    actor_role: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any],
) -> AuditEvent:
    """Append one event in the caller's transaction, chaining it to the previous event."""
    last = session.scalars(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).first()
    prev_hash = last.hash if last else GENESIS
    seq = (last.seq + 1) if last else 1
    clean_payload = json.loads(canonical(payload))
    event = AuditEvent(
        seq=seq,
        occurred_at=datetime.now(UTC).replace(tzinfo=None, microsecond=0),
        actor_id=actor_id,
        actor_role=actor_role,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=clean_payload,
        prev_hash=prev_hash,
        hash="",
    )
    event.hash = compute_hash(prev_hash, _body(event))
    session.add(event)
    session.flush()
    return event


@dataclass
class Verification:
    intact: bool
    events_checked: int
    first_broken_seq: int | None


def verify(session: Session) -> Verification:
    """Recompute the chain and report the first event whose hash or link does not match."""
    prev = GENESIS
    n = 0
    for e in session.scalars(select(AuditEvent).order_by(AuditEvent.seq)):
        n += 1
        if e.prev_hash != prev or compute_hash(prev, _body(e)) != e.hash:
            return Verification(False, n, e.seq)
        prev = e.hash
    return Verification(True, n, None)
