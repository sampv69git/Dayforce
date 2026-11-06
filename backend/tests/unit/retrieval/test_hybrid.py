"""Retrieval: filters, required seeding, ranking smoke tests (BM25 path; embeddings off in unit tests)."""

from __future__ import annotations

from datetime import date

from app.retrieval.corpus import clause_index, load_clauses
from app.retrieval.hybrid import retrieve, tokenize


def ids(results: list) -> list[str]:  # type: ignore[type-arg]
    return [r.clause_id for r in results]


def test_corpus_loads_with_unique_ids() -> None:
    clauses = load_clauses()
    assert len(clauses) == len({c.clause_id for c in clauses}) >= 45


def test_every_rule_required_clause_exists() -> None:
    from app.engine.catalog import _REQUIRED, RULES

    idx = clause_index()
    for rule in RULES:
        for clauses in _REQUIRED[rule].values():
            assert all(c in idx for c in clauses), rule


def test_jurisdiction_filter_excludes_other_addenda() -> None:
    res = retrieve("meal period missed", jurisdiction="US-TX", k=10)
    assert not any(r.document_id in {"CA", "BLR"} for r in res)
    ca = retrieve("meal period missed", jurisdiction="US-CA", k=10)
    assert any(r.document_id == "CA" for r in ca)


def test_employee_class_filter() -> None:
    exempt = retrieve(
        "weekly overtime hours over 40", jurisdiction="US-TX", employee_class="exempt", k=10
    )
    assert "TA-4.1" not in ids(exempt)


def test_effective_date_filter() -> None:
    assert retrieve("overtime", jurisdiction="US-CA", on_date=date(2025, 6, 1), k=5) == []


def test_required_clause_always_present_and_first() -> None:
    res = retrieve(
        "unrelated words about forklifts", jurisdiction="US-CA", required_ids=["TA-3.4"], k=5
    )
    assert res[0].clause_id == "TA-3.4" and res[0].required


def test_bm25_finds_relevant_clause() -> None:
    res = retrieve(
        "missing punch added only at a time supported by independent evidence badge",
        jurisdiction="US-CA",
        k=5,
        seed_required=False,
    )
    assert "TA-3.2" in ids(res)
    assert res[0].bm25_rank is not None


def test_override_precedence_flag() -> None:
    res = retrieve(
        "meal period begin before end of fifth hour", jurisdiction="US-CA", k=5, seed_required=False
    )
    ca42 = next(r for r in res if r.clause_id == "CA-4.2")
    assert ca42.precedence == "override"


def test_tokenize_drops_stopwords() -> None:
    assert tokenize("The meal period of 30 minutes") == ["meal", "period", "30", "minutes"]
