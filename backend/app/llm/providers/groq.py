"""Groq (OpenAI-compatible) provider for open-weight models with strict JSON-schema decoding."""

from __future__ import annotations

import time
from typing import Any

from app.llm.base import GenParams, Message, ProviderError, RawCompletion


class GroqProvider:
    id = "groq"

    def __init__(self, api_key: str | None, base_url: str, model_id: str) -> None:
        self.model_id = model_id
        self._api_key = api_key
        self._base_url = base_url

    def draft(
        self, messages: list[Message], schema: dict[str, Any], params: GenParams
    ) -> RawCompletion:
        if not self._api_key:
            raise ProviderError("GROQ_API_KEY is not configured")
        from openai import OpenAI, OpenAIError

        client = OpenAI(
            api_key=self._api_key, base_url=self._base_url, timeout=params.timeout_s, max_retries=1
        )
        kwargs: dict[str, Any] = {
            "model": self.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": params.temperature,
            "max_completion_tokens": params.max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "DraftResolution", "strict": True, "schema": schema},
            },
        }
        if "gpt-oss" in self.model_id:
            kwargs["reasoning_effort"] = "low"
        start = time.perf_counter()
        try:
            resp = client.chat.completions.create(**kwargs)
        except OpenAIError as exc:
            raise ProviderError(f"Groq request failed: {exc}") from exc
        latency = int((time.perf_counter() - start) * 1000)
        choice = resp.choices[0]
        usage = resp.usage
        return RawCompletion(
            text=choice.message.content or "",
            provider=self.id,
            model_id=resp.model or self.model_id,
            latency_ms=latency,
            tokens={
                "input": usage.prompt_tokens if usage else 0,
                "output": usage.completion_tokens if usage else 0,
            },
            meta={"finish_reason": choice.finish_reason},
        )
