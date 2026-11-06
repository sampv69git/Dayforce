"""Application settings loaded from environment variables and `.env`."""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]

ProviderName = Literal["groq", "ollama", "rule_based", "scripted"]


class Settings(BaseSettings):
    """Runtime configuration. Secrets come only from the environment."""

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["dev", "test", "prod"] = "dev"
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'countersign.db').as_posix()}"
    jwt_secret: str = "dev-only-change-me-please-32-characters"
    jwt_ttl_hours: int = 8
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173"]
    )
    log_level: str = "INFO"

    llm_provider: ProviderName = "groq"
    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "openai/gpt-oss-20b"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    llm_timeout_s: float = 30.0
    llm_max_output_tokens: int = 1200

    embeddings_enabled: bool = True
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_cache_dir: str = str(BACKEND_DIR / ".fastembed_cache")

    demo_now: datetime = datetime.fromisoformat("2026-11-06T11:00:00-08:00")
    payroll_cutoff: datetime = datetime.fromisoformat("2026-11-09T12:00:00-08:00")
    week_start: str = "2026-11-02"
    seed: int = 20261106
    policy_version: str = "2026.2"
    auto_seed: bool = True


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
