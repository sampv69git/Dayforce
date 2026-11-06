"""Dense embeddings with fastembed (BAAI/bge-small-en-v1.5, 384 dimensions, CPU, MIT licence)."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any, Literal

import numpy as np

from app.config import get_settings
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from fastembed import TextEmbedding

log = get_logger(__name__)
_model: TextEmbedding | None = None
_lock = threading.Lock()
_failed = False

QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def _get_model() -> TextEmbedding | None:
    global _model, _failed
    settings = get_settings()
    if not settings.embeddings_enabled or _failed:
        return None
    with _lock:
        if _model is None:
            try:
                from fastembed import TextEmbedding

                _model = TextEmbedding(
                    settings.embedding_model, cache_dir=settings.embedding_cache_dir
                )
            except Exception as exc:  # network or model download failure
                log.warning("embedding_model_unavailable", error=str(exc))
                _failed = True
                return None
    return _model


def _normalise(vec: Any) -> list[float]:
    arr = np.asarray(vec, dtype=np.float32)
    norm = float(np.linalg.norm(arr)) or 1.0
    return [float(x) for x in (arr / norm)]


def embed_texts(texts: list[str]) -> list[list[float] | None]:
    """Embed passages. Returns None per text when embeddings are disabled or unavailable."""
    model = _get_model()
    if model is None:
        return [None for _ in texts]
    return [_normalise(v) for v in model.embed(texts)]


def embed_query(text: str) -> list[float] | None:
    model = _get_model()
    if model is None:
        return None
    return _normalise(next(iter(model.embed([QUERY_PREFIX + text]))))


def embeddings_status() -> Literal["ok", "error", "disabled"]:
    if not get_settings().embeddings_enabled:
        return "disabled"
    return "error" if _failed else "ok"
