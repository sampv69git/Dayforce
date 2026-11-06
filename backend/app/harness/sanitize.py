"""Untrusted text handling: normalise, cap, and flag instruction-like content (OWASP LLM01)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

MAX_LEN = 500
_ZERO_WIDTH = re.compile(r"[​-‏‪-‮⁠-⁤﻿]")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

PATTERNS: dict[str, re.Pattern[str]] = {
    "override_instructions": re.compile(
        r"\b(ignore|disregard|forget|override)\b.{0,40}\b(instruction|rule|prompt|polic(y|ies)|above|previous|prior)",
        re.I | re.S,
    ),
    "role_play": re.compile(r"\b(you are now|act as|pretend to be|from now on you)\b", re.I),
    "privilege_claim": re.compile(
        r"\b(admin|developer|system|god|debug)\s*(mode|access|override)\b", re.I
    ),
    "fake_system_tag": re.compile(
        r"(<\s*/?\s*(system|assistant|instructions?)\s*>|^\s*system\s*:|\bsystem\s*:)", re.I | re.M
    ),
    "approval_request": re.compile(
        r"\b(approve|authori[sz]e|pay)\b.{0,30}\b\d+(\.\d+)?\s*(h|hours?)\b", re.I
    ),
    "citation_steering": re.compile(
        r"\b(cite|citing|reference)\b.{0,30}\b(polic(y|ies)|clause|TA-|CA-|BLR-)", re.I
    ),
    "json_smuggling": re.compile(r"[{\[]\s*\"(op|operations|exception_id|citations)\"", re.I),
}


@dataclass(frozen=True)
class SanitizedText:
    original_length: int
    text: str
    flags: list[str] = field(default_factory=list)
    truncated: bool = False

    @property
    def suspicious(self) -> bool:
        return bool(self.flags)


def sanitize(raw: str | None) -> SanitizedText:
    """Return a cleaned copy of untrusted text with injection flags. Never raises."""
    if not raw:
        return SanitizedText(0, "", [])
    text = unicodedata.normalize("NFKC", raw)
    text = _ZERO_WIDTH.sub("", text)
    text = _CONTROL.sub(" ", text)
    text = text.replace("<untrusted_employee_text>", "").replace("</untrusted_employee_text>", "")
    truncated = len(text) > MAX_LEN
    text = text[:MAX_LEN].strip()
    flags = [name for name, pat in PATTERNS.items() if pat.search(text)]
    return SanitizedText(len(raw), text, flags, truncated)
