"""Startup tasks: apply migrations, then seed demo data when the database is empty."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from sqlalchemy import select

from alembic import command
from app.config import BACKEND_DIR, get_settings
from app.observability.logging import get_logger

log = get_logger(__name__)


def run_migrations(database_url: str | None = None) -> None:
    cfg = Config(str(Path(BACKEND_DIR) / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(BACKEND_DIR) / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url or get_settings().database_url)
    command.upgrade(cfg, "head")


def bootstrap() -> None:
    run_migrations()
    from app.db import session_scope
    from app.domain.models import Site

    with session_scope() as s:
        empty = s.scalars(select(Site.code)).first() is None
    if empty and get_settings().auto_seed:
        from app.seed.load import seed

        log.info("auto_seed_start")
        seed(reset=True)
    from app.retrieval.hybrid import get_index

    get_index()  # warm the retrieval index and embedding model
    log.info("bootstrap_complete", seeded=empty)
