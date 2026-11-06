# Third-Party Components

Versions are the latest published on 2026-11-06 and will be pinned in lock files at scaffold time. This table is updated whenever a dependency is added or removed.

## Models

| Component | Version | Licence | Acceptable use / attribution | Source |
|---|---|---|---|---|
| gpt-oss-20b | release Aug 2025 | Apache 2.0 | gpt-oss usage policy: use in compliance with all applicable law | https://huggingface.co/openai/gpt-oss-20b, https://github.com/openai/gpt-oss/blob/main/USAGE_POLICY |
| Qwen3-4B (`qwen3:4b` in Ollama) | Qwen3 | Apache 2.0 | Include licence and attribution when redistributing | https://huggingface.co/Qwen/Qwen3-4B |
| BAAI/bge-small-en-v1.5 | v1.5 | MIT | Keep copyright notice | https://huggingface.co/BAAI/bge-small-en-v1.5 |

## Services

| Service | Use | Terms |
|---|---|---|
| Groq API | Hosted inference of gpt-oss-20b | Groq terms of service; synthetic data only |
| GitHub Actions | CI | GitHub terms |

## Backend (Python)

| Package | Version (planned) | Licence |
|---|---|---|
| fastapi | 0.162 | MIT |
| pydantic | 2.14 | MIT |
| sqlalchemy | 2.1 | MIT |
| alembic | 1.20 | MIT |
| uvicorn | 0.54 | BSD-3-Clause |
| psycopg | 3.3 | LGPL-3.0 (dynamically linked library, unmodified) |
| pgvector (Python) | 0.5 | MIT |
| fastembed | 0.9 | Apache 2.0 |
| rank-bm25 | 0.2.2 | Apache 2.0 |
| openai (SDK, used as OpenAI-compatible client for Groq) | 3.46 | Apache 2.0 |
| httpx | latest | BSD-3-Clause |
| structlog | 26.1 | MIT or Apache 2.0 |
| pyjwt | latest | MIT |
| pydantic-settings | 2.x | MIT |
| numpy | 2.x | BSD-3-Clause |
| pyyaml | 6.x | MIT |
| tzdata | latest | Apache 2.0 |
| pytest | 9.2 | MIT |
| schemathesis | 4.33 | MIT |
| ruff | 0.17 | MIT |
| mypy | 2.4 | MIT |
| mcp (stretch) | 2.3 | MIT |

## Frontend (npm)

| Package | Version (planned) | Licence |
|---|---|---|
| react, react-dom | 19.3 | MIT |
| vite | 8.3 | MIT |
| typescript | 5.9.3 (openapi-typescript requires 5.x) | Apache 2.0 |
| tailwindcss | 4.3 | MIT |
| shadcn/ui (copied components) and Radix UI primitives | latest | MIT |
| @tanstack/react-query | 5.106 | MIT |
| react-router | 8.5 | MIT |
| recharts | 3.10 | MIT |
| motion | 14.9 | MIT |
| cmdk | 1.1 | MIT |
| sonner | 2.0 | MIT |
| lucide-react | 1.70 | ISC |
| zod | 4.6 | MIT |
| openapi-typescript, openapi-fetch | 7.13, 0.17 | MIT |
| vitest | 5.1 | MIT |
| @playwright/test | 1.65 | Apache 2.0 |
| @axe-core/playwright | latest | MPL-2.0 |
| oxlint | 1.x | MIT |
| clsx, tailwind-merge, class-variance-authority | latest | MIT |
| @tailwindcss/vite | 4.x | MIT |

## Fonts and icons

| Asset | Licence | Source |
|---|---|---|
| Geist Sans and Geist Mono via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` | SIL Open Font License 1.1 | https://github.com/vercel/geist-font |
| Instrument Serif via `@fontsource/instrument-serif` (display accents) | SIL Open Font License 1.1 | https://github.com/Instrument/instrument-serif |
| Lucide icons | ISC | https://lucide.dev |

## Infrastructure images

| Image | Licence |
|---|---|
| pgvector/pgvector:pg16 | PostgreSQL License (pgvector), PostgreSQL License (PostgreSQL) |
| python:3.12-slim | PSF and Debian licences |
| node:22-alpine, nginx:alpine | MIT, BSD-2-Clause |
| ollama/ollama | MIT |
