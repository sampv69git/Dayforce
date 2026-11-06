"""Minimal span recorder with OpenTelemetry-compatible fields, persisted for the Harness Inspector."""

from __future__ import annotations

import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.domain.models import TraceSpan


@dataclass
class Span:
    span_id: str
    parent_id: str | None
    name: str
    start: datetime
    end: datetime | None = None
    status: str = "ok"
    attributes: dict[str, Any] = field(default_factory=dict)

    def set(self, **attrs: Any) -> None:
        self.attributes.update(attrs)


class Tracer:
    def __init__(self, trace_id: str | None = None) -> None:
        self.trace_id = trace_id or secrets.token_hex(16)
        self.spans: list[Span] = []
        self._stack: list[Span] = []

    @contextmanager
    def span(self, name: str, **attrs: Any) -> Iterator[Span]:
        parent = self._stack[-1].span_id if self._stack else None
        sp = Span(secrets.token_hex(8), parent, name, datetime.now(UTC), attributes=dict(attrs))
        self.spans.append(sp)
        self._stack.append(sp)
        try:
            yield sp
        except Exception as exc:
            sp.status = "error"
            sp.attributes["error"] = str(exc)
            raise
        finally:
            sp.end = datetime.now(UTC)
            self._stack.pop()

    def persist(self, session: Session) -> None:
        for sp in self.spans:
            session.add(
                TraceSpan(
                    trace_id=self.trace_id,
                    span_id=sp.span_id,
                    parent_id=sp.parent_id,
                    name=sp.name,
                    start=sp.start.replace(tzinfo=None),
                    end=(sp.end or sp.start).replace(tzinfo=None),
                    status=sp.status,
                    attributes=sp.attributes,
                )
            )
