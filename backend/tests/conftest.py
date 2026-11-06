"""Shared fixtures: a fresh SQLite database per test session."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LLM_PROVIDER", "rule_based")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("EMBEDDINGS_ENABLED", "false")


@pytest.fixture(scope="session")
def db_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    path: Path = tmp_path_factory.mktemp("db") / "test.db"
    url = f"sqlite:///{path.as_posix()}"
    os.environ["DATABASE_URL"] = url
    from app.config import get_settings

    get_settings.cache_clear()
    from app.bootstrap import run_migrations
    from app.db import reset_engine

    run_migrations(url)
    reset_engine(url)
    yield url


@pytest.fixture(scope="module")
def seeded(db_url: str) -> str:
    """Reseed the demo dataset for each test module so modules never share mutated state."""
    from app.seed.load import seed

    seed(reset=True)
    return db_url
