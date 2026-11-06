"""API contract: the committed openapi.yaml matches the code, and responses conform to it."""

from __future__ import annotations

from pathlib import Path

import pytest
import schemathesis
from hypothesis import HealthCheck, settings

from app.config import ROOT_DIR


def test_openapi_yaml_has_no_drift() -> None:
    from app.export_openapi import generate

    committed = (Path(ROOT_DIR) / "openapi.yaml").read_text(encoding="utf-8")
    assert committed == generate(), "openapi.yaml is stale: run `make openapi`"


@pytest.fixture(scope="module")
def app_and_token(seeded: str):  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app(run_bootstrap=False)
    token = (
        TestClient(app)
        .post("/api/v1/auth/demo-login", json={"user_id": "u-arjun"})
        .json()["access_token"]
    )
    return app, token


schema = schemathesis.pytest.from_fixture("contract_schema")


@pytest.fixture(scope="module")
def contract_schema(app_and_token):  # type: ignore[no-untyped-def]
    app, _ = app_and_token
    # Destructive admin operations (reset, detect, replay) are covered by integration tests instead.
    return schemathesis.openapi.from_asgi("/api/v1/openapi.json", app).exclude(
        path_regex=r"/admin/(reset|detect|replay)$"
    )


@schema.parametrize()
@settings(max_examples=8, suppress_health_check=list(HealthCheck), deadline=None)
def test_endpoints_conform_to_schema(case, app_and_token) -> None:  # type: ignore[no-untyped-def]
    _, token = app_and_token
    case.headers = {**(case.headers or {}), "Authorization": f"Bearer {token}"}
    response = case.call()
    assert response.status_code < 500, response.text
    case.validate_response(response)
