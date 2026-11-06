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


def backfill_credentials() -> int:
    """Give seeded users created before password sign-in existed their synthetic credentials."""
    from datetime import UTC, datetime

    from app.auth.passwords import hash_password
    from app.db import session_scope
    from app.domain.models import User, UserCredential
    from app.seed.load import seed_email

    added = 0
    with session_scope() as s:
        have = set(s.scalars(select(UserCredential.user_id)))
        for u in s.scalars(select(User)):
            if u.id in have:
                continue
            s.add(
                UserCredential(
                    user_id=u.id,
                    email=seed_email(u.display_name),
                    password_hash=hash_password(get_settings().seed_user_password),
                    failed_attempts=0,
                    password_changed_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            added += 1
    if added:
        log.info("credentials_backfilled", users=added)
    return added


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
    elif get_settings().auto_seed:
        backfill_credentials()
    from app.retrieval.hybrid import get_index

    get_index()  # warm the retrieval index and embedding model
    log.info("bootstrap_complete", seeded=empty)
