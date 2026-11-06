"""Liveness and readiness endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.db import session_scope

router = APIRouter(tags=["system"])


class Health(BaseModel):
    status: Literal["ok"]


class ProviderHealth(BaseModel):
    provider: str
    model_id: str
    available: bool
    detail: str | None = None


class Readiness(BaseModel):
    database: Literal["ok", "error"]
    embeddings: Literal["ok", "error", "disabled"]
    provider: ProviderHealth


@router.get("/health", response_model=Health)
def health() -> Health:
    """Liveness: the process is up."""
    return Health(status="ok")


@router.get("/health/ready", response_model=Readiness)
def ready() -> Readiness:
    """Readiness: database reachable, embeddings loaded, provider status."""
    db_ok: Literal["ok", "error"] = "ok"
    try:
        with session_scope() as s:
            s.execute(text("SELECT 1"))
    except Exception:
        db_ok = "error"
    from app.llm.registry import provider_status
    from app.retrieval.embed import embeddings_status

    status = provider_status()
    return Readiness(
        database=db_ok,
        embeddings=embeddings_status(),
        provider=ProviderHealth(**status),
    )
