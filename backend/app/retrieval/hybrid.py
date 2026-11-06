"""Hybrid policy retrieval: metadata filters, BM25 + dense ranking fused with RRF, required seeding.

The same function serves the drafting pipeline and the retrieval playground, so what users test is
what the model receives.
"""

from __future__ import annotations

import re
import threading
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

import numpy as np
from rank_bm25 import BM25Okapi

from app.retrieval.corpus import Clause, load_clauses
from app.retrieval.embed import embed_query, embed_texts

RRF_K = 60
TOKEN = re.compile(r"[a-z0-9]+")
STOP = {
    "the",
    "a",
    "an",
    "of",
    "to",
    "in",
    "and",
    "or",
    "is",
    "are",
    "be",
    "for",
    "on",
    "at",
    "with",
    "by",
    "that",
    "this",
    "it",
    "as",
    "from",
    "than",
    "no",
    "not",
    "any",
    "each",
    "every",
    "may",
}


def tokenize(text: str) -> list[str]:
    return [t for t in TOKEN.findall(text.lower()) if t not in STOP]


@dataclass(frozen=True)
class Retrieved:
    clause_id: str
    document_id: str
    document_title: str
    title: str
    text: str
    bm25_rank: int | None
    dense_rank: int | None
    fused_score: float
    required: bool
    precedence: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class _Index:
    """In-process index over the policy corpus (49 clauses). Built once per process."""

    def __init__(self) -> None:
        self.clauses: list[Clause] = list(load_clauses())
        self.bm25 = BM25Okapi([tokenize(f"{c.title} {c.title} {c.text}") for c in self.clauses])
        vectors = embed_texts([f"{c.title}. {c.text}" for c in self.clauses])
        self.matrix: np.ndarray | None = (
            np.asarray(vectors, dtype=np.float32) if all(v is not None for v in vectors) else None
        )


_index: _Index | None = None
_lock = threading.Lock()


def get_index() -> _Index:
    global _index
    with _lock:
        if _index is None:
            _index = _Index()
    return _index


def reset_index() -> None:
    global _index
    with _lock:
        _index = None


def _rank(scores: dict[int, float]) -> dict[int, int]:
    ordered = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return {i: r + 1 for r, (i, s) in enumerate(ordered) if s > 0}


def retrieve(
    query: str,
    *,
    jurisdiction: str,
    employee_class: str = "non_exempt",
    on_date: date | None = None,
    required_ids: list[str] | None = None,
    k: int = 5,
    methods: tuple[str, ...] = ("bm25", "dense"),
    seed_required: bool = True,
    session: Any = None,
) -> list[Retrieved]:
    """Return the top-k applicable clauses with per-method ranks. Required clauses are always kept."""
    idx = get_index()
    on = on_date or date(2026, 11, 6)
    allowed = [i for i, c in enumerate(idx.clauses) if c.applies(jurisdiction, employee_class, on)]
    required = set(required_ids or [])
    bm25_ranks: dict[int, int] = {}
    dense_ranks: dict[int, int] = {}
    if "bm25" in methods:
        raw = idx.bm25.get_scores(tokenize(query))
        bm25_ranks = _rank({i: float(raw[i]) for i in allowed})
    if "dense" in methods and idx.matrix is not None:
        if session is not None and dense_backend() == "pgvector":
            pos = {c.clause_id: i for i, c in enumerate(idx.clauses)}
            ids = pgvector_rank(
                session, query, [idx.clauses[i].clause_id for i in allowed], len(allowed)
            )
            dense_ranks = {pos[cid]: r + 1 for r, cid in enumerate(ids)}
        else:
            q = embed_query(query)
            if q is not None:
                sims = idx.matrix @ np.asarray(q, dtype=np.float32)
                dense_ranks = _rank({i: float(sims[i]) + 1.0 for i in allowed})  # keep all positive
    fused: dict[int, float] = {}
    for ranks in (bm25_ranks, dense_ranks):
        for i, r in ranks.items():
            fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + r)
    ordered = sorted(fused, key=lambda i: (-fused[i], i))
    chosen = [i for i in allowed if idx.clauses[i].clause_id in required] if seed_required else []
    for i in ordered:
        if len(chosen) >= k:
            break
        if i not in chosen:
            chosen.append(i)
    chosen.sort(key=lambda i: (idx.clauses[i].clause_id not in required, -fused.get(i, 0.0)))
    return [
        Retrieved(
            clause_id=idx.clauses[i].clause_id,
            document_id=idx.clauses[i].document_id,
            document_title=idx.clauses[i].document_title,
            title=idx.clauses[i].title,
            text=idx.clauses[i].text,
            bm25_rank=bm25_ranks.get(i),
            dense_rank=dense_ranks.get(i),
            fused_score=round(fused.get(i, 0.0), 5),
            required=idx.clauses[i].clause_id in required,
            precedence=idx.clauses[i].precedence,
        )
        for i in chosen
    ]


def dense_backend() -> str:
    """Which dense search path is active (reported in traces)."""
    from app.config import get_settings

    if get_index().matrix is None:
        return "disabled"
    return "pgvector" if get_settings().database_url.startswith("postgresql") else "numpy"


def pgvector_rank(session: Any, query: str, allowed_ids: list[str], limit: int = 10) -> list[str]:
    """Dense ranking with pgvector cosine distance (`<=>`) on PostgreSQL."""
    from sqlalchemy import bindparam, text

    q = embed_query(query)
    if q is None or not allowed_ids:
        return []
    literal = "[" + ",".join(f"{x:.7f}" for x in q) + "]"
    stmt = text(
        "SELECT clause_id FROM policy_clauses WHERE clause_id IN :ids "
        "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :n"
    ).bindparams(bindparam("ids", expanding=True))
    return [row[0] for row in session.execute(stmt, {"ids": allowed_ids, "q": literal, "n": limit})]
