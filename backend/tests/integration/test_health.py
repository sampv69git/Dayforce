from fastapi.testclient import TestClient


def test_health_ok(db_url: str) -> None:
    from app.main import create_app

    client = TestClient(create_app(run_bootstrap=False))
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert "X-Request-ID" in resp.headers


def test_ready_reports_components(db_url: str) -> None:
    from app.main import create_app

    client = TestClient(create_app(run_bootstrap=False))
    body = client.get("/api/v1/health/ready").json()
    assert body["database"] == "ok"
    assert body["provider"]["provider"] == "rule_based"


def test_unknown_route_is_problem_json(db_url: str) -> None:
    from app.main import create_app

    client = TestClient(create_app(run_bootstrap=False))
    resp = client.get("/api/v1/does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")
