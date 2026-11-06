"""Ollama provider for local open-weight models (schema-constrained `format`)."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.llm.base import GenParams, Message, ProviderError, RawCompletion


class OllamaProvider:
    id = "ollama"

    def __init__(self, base_url: str, model_id: str) -> None:
        self.model_id = model_id
        self._base_url = base_url.rstrip("/")

    def draft(
        self, messages: list[Message], schema: dict[str, Any], params: GenParams
    ) -> RawCompletion:
        body = {
            "model": self.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "format": schema,
            "stream": False,
            "think": False,
            "options": {"temperature": params.temperature, "num_predict": params.max_tokens},
        }
        start = time.perf_counter()
        try:
            resp = httpx.post(
                f"{self._base_url}/api/chat", json=body, timeout=max(params.timeout_s, 180)
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama request failed: {exc}") from exc
        data = resp.json()
        return RawCompletion(
            text=data.get("message", {}).get("content", ""),
            provider=self.id,
            model_id=self.model_id,
            latency_ms=int((time.perf_counter() - start) * 1000),
            tokens={"input": data.get("prompt_eval_count", 0), "output": data.get("eval_count", 0)},
        )

    def available(self) -> bool:
        try:
            r = httpx.get(f"{self._base_url}/api/tags", timeout=1.5)
            names = [m.get("name", "") for m in r.json().get("models", [])]
            return r.status_code == 200 and any(n.startswith(self.model_id) for n in names)
        except (httpx.HTTPError, ValueError):
            return False
