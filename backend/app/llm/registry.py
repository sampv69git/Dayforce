"""Provider selection: environment default, overridable at runtime by an admin (stored in app_settings)."""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.llm.base import LLMProvider
from app.llm.providers.groq import GroqProvider
from app.llm.providers.ollama import OllamaProvider

SETTING_KEY = "llm_provider"


def current_provider_name() -> str:
    from app.db import session_scope
    from app.domain.models import AppSetting

    try:
        with session_scope() as s:
            row = s.get(AppSetting, SETTING_KEY)
            if row and row.value.get("provider"):
                return str(row.value["provider"])
    except Exception:  # database not ready yet
        pass
    return get_settings().llm_provider


def set_provider_name(name: str) -> None:
    from app.db import session_scope
    from app.domain.models import AppSetting

    with session_scope() as s:
        row = s.get(AppSetting, SETTING_KEY)
        if row is None:
            s.add(AppSetting(key=SETTING_KEY, value={"provider": name}))
        else:
            row.value = {"provider": name}


def build_provider(name: str) -> LLMProvider | None:
    """Return a network provider, or None for the rule-based (degraded) mode."""
    s = get_settings()
    if name == "groq":
        return GroqProvider(s.groq_api_key, s.groq_base_url, s.groq_model)
    if name == "ollama":
        return OllamaProvider(s.ollama_base_url, s.ollama_model)
    return None


def provider_status(name: str | None = None) -> dict[str, Any]:
    s = get_settings()
    name = name or current_provider_name()
    if name == "groq":
        ok = bool(s.groq_api_key)
        return {
            "provider": "groq",
            "model_id": s.groq_model,
            "available": ok,
            "detail": None
            if ok
            else "GROQ_API_KEY is not set; drafts fall back to rule-based templates",
        }
    if name == "ollama":
        ok = OllamaProvider(s.ollama_base_url, s.ollama_model).available()
        return {
            "provider": "ollama",
            "model_id": s.ollama_model,
            "available": ok,
            "detail": None if ok else f"Ollama or model {s.ollama_model} not reachable",
        }
    return {
        "provider": "rule_based",
        "model_id": "deterministic-templates-v1",
        "available": True,
        "detail": "Rule-based mode: no LLM is called",
    }
