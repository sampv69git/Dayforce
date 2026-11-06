"""Embedding model access (fastembed, bge-small-en-v1.5)."""

from __future__ import annotations

from typing import Literal

from app.config import get_settings


def embeddings_status() -> Literal["ok", "error", "disabled"]:
    return "ok" if get_settings().embeddings_enabled else "disabled"
