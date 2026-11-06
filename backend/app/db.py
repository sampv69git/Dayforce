"""Database engine, session factory, and declarative base."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import JSON, MetaData, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.config import get_settings

EMBEDDING_DIM = 384

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base with a stable constraint naming convention."""

    metadata = MetaData(naming_convention=NAMING)


class Embedding(TypeDecorator[list[float]]):
    """pgvector `vector(384)` on PostgreSQL, JSON array elsewhere (SQLite)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector

            return dialect.type_descriptor(Vector(EMBEDDING_DIM))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return [float(x) for x in value]

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return [float(x) for x in value]


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn: Any, _: Any) -> None:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Return the process-wide engine, creating it on first use."""
    global _engine, _session_factory
    if _engine is None:
        _engine = _make_engine(get_settings().database_url)
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def reset_engine(url: str | None = None) -> Engine:
    """Recreate the engine (used by tests to point at a fresh database)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = _make_engine(url or get_settings().database_url)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope: commit on success, roll back on error."""
    session = session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session per request."""
    session = session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
