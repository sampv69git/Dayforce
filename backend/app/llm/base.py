"""Provider protocol shared by every LLM backend."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class ProviderError(Exception):
    """Raised when a provider call fails (network, timeout, HTTP error, refusal)."""


@dataclass(frozen=True)
class Message:
    role: str  # system | user | assistant
    content: str


@dataclass(frozen=True)
class GenParams:
    temperature: float = 0.0
    max_tokens: int = 1200
    timeout_s: float = 30.0


@dataclass
class RawCompletion:
    text: str
    provider: str
    model_id: str
    latency_ms: int
    tokens: dict[str, int] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    id: str
    model_id: str

    def draft(
        self, messages: list[Message], schema: dict[str, Any], params: GenParams
    ) -> RawCompletion:
        """Return the raw model text. Must raise ProviderError on failure."""
        ...
