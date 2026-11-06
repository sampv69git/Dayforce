"""Startup tasks: apply migrations and seed demo data when the database is empty."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config

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
    log.info("bootstrap_complete")
