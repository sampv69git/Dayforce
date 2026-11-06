# Countersign developer tasks. Windows users without make: run the commands shown in README.
.PHONY: dev api web seed reset detect test lint typecheck openapi openapi-check test-contract eval-ci eval-groq eval-ollama web-test e2e check

api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

web:
	cd frontend && npm run dev

dev:
	$(MAKE) -j2 api web

seed:
	cd backend && uv run python -m app.seed.load --reset

detect:
	cd backend && uv run python -m app.services.detection

test:
	cd backend && uv run pytest -q --cov=app/engine --cov=app/harness --cov-report=term-missing:skip-covered

lint:
	cd backend && uv run ruff check app tests ../eval && uv run ruff format --check app tests ../eval
	cd frontend && npm run lint

typecheck:
	cd backend && uv run mypy
	cd frontend && npm run typecheck

openapi:
	cd backend && uv run python -m app.export_openapi ../openapi.yaml
	cd frontend && npm run gen:api

openapi-check:
	cd backend && uv run python -m app.export_openapi --check ../openapi.yaml

test-contract: openapi-check
	cd backend && uv run pytest -q tests/contract

eval-ci:
	cd backend && uv run python -m eval.run --providers scripted,rule_based --gate

eval-groq:
	cd backend && uv run python -m eval.run --providers groq

eval-ollama:
	cd backend && uv run python -m eval.run --providers ollama --limit 40

web-test:
	cd frontend && npm test

e2e:
	cd frontend && npm run e2e

check: lint typecheck test test-contract eval-ci web-test
