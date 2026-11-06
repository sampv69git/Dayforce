"""LLM provider selection and status."""

from __future__ import annotations

from app.config import get_settings


def provider_status() -> dict[str, object]:
    """Report the configured provider. Replaced by the full registry in step 5."""
    s = get_settings()
    model = {"groq": s.groq_model, "ollama": s.ollama_model}.get(s.llm_provider, "templates")
    available = s.llm_provider != "groq" or bool(s.groq_api_key)
    return {
        "provider": s.llm_provider,
        "model_id": model,
        "available": available,
        "detail": None if available else "GROQ_API_KEY is not set",
    }
