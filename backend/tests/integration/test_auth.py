"""Email and password sign-in: success, generic failures, lockout, revocation, password change."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.db import session_scope
from app.domain import models as m

PASSWORD = "Countersign2026"
MAYA = "maya.chen@kestrel.example"


@pytest.fixture()
def client(seeded: str) -> Iterator[TestClient]:
    from app.main import create_app

    with TestClient(create_app(run_bootstrap=False)) as c:
        yield c


def login(client: TestClient, email: str = MAYA, password: str = PASSWORD):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def reset_lock(email: str = MAYA) -> None:
    with session_scope() as s:
        cred = s.scalars(select(m.UserCredential).where(m.UserCredential.email == email)).one()
        cred.failed_attempts = 0
        cred.locked_until = None


def test_seeded_accounts_have_hashed_passwords(client: TestClient) -> None:
    with session_scope() as s:
        creds = s.scalars(select(m.UserCredential)).all()
        assert len(creds) == len(s.scalars(select(m.User)).all())
        assert all(c.password_hash.startswith("scrypt$") for c in creds)
        assert all(PASSWORD not in c.password_hash for c in creds)


def test_password_login_issues_a_working_session(client: TestClient) -> None:
    r = login(client, "  Maya.Chen@Kestrel.example ")  # case and whitespace insensitive
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["user_id"] == "u-maya"
    assert body["user"]["email"] == MAYA
    assert body["user"]["auth_method"] == "password"
    assert body["expires_in"] == get_settings().jwt_ttl_hours * 3600
    me = client.get("/api/v1/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200 and me.json()["auth_method"] == "password"
    # RBAC still applies: a manager cannot reach payroll-only endpoints.
    assert client.get("/api/v1/audit", headers=bearer(body["access_token"])).status_code == 403


def test_failures_are_generic_for_unknown_email_and_wrong_password(client: TestClient) -> None:
    wrong = login(client, MAYA, "not-the-password-1")
    unknown = login(client, "nobody@kestrel.example", "whatever-123")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"] == "Email or password is incorrect"
    assert wrong.headers["content-type"].startswith("application/problem+json")
    reset_lock()


def test_repeated_failures_lock_the_account(client: TestClient) -> None:
    limit = get_settings().login_max_attempts
    for _ in range(limit - 1):
        assert login(client, MAYA, "bad-password-99").status_code == 401
    locked = login(client, MAYA, "bad-password-99")
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0
    # Even the right password is refused while locked.
    assert login(client).status_code == 429
    with session_scope() as s:
        events = [e.event_type for e in s.scalars(select(m.AuditEvent))]
        assert "auth.locked" in events and "auth.login_failed" in events
    reset_lock()
    assert login(client).status_code == 200


def test_success_resets_the_failure_counter(client: TestClient) -> None:
    limit = get_settings().login_max_attempts
    for _ in range(limit - 1):
        login(client, MAYA, "bad-password-99")
    assert login(client).status_code == 200
    assert login(client, MAYA, "bad-password-99").status_code == 401  # counter started again
    reset_lock()


def test_logout_revokes_only_that_session(client: TestClient) -> None:
    a = login(client).json()["access_token"]
    b = login(client).json()["access_token"]
    r = client.post("/api/v1/auth/logout", headers=bearer(a))
    assert r.status_code == 200 and r.json()["status"] == "signed_out"
    assert client.get("/api/v1/me", headers=bearer(a)).status_code == 401
    assert client.get("/api/v1/me", headers=bearer(b)).status_code == 200
    with session_scope() as s:
        assert "auth.logout" in [e.event_type for e in s.scalars(select(m.AuditEvent))]


def test_change_password_rotates_sessions_and_enforces_policy(client: TestClient) -> None:
    old = login(client).json()["access_token"]
    weak = client.post(
        "/api/v1/auth/password",
        headers=bearer(old),
        json={"current_password": PASSWORD, "new_password": "short"},
    )
    assert weak.status_code == 422
    wrong = client.post(
        "/api/v1/auth/password",
        headers=bearer(old),
        json={"current_password": "nope-nope-1", "new_password": "Brand-new-pass-42"},
    )
    assert wrong.status_code == 403
    ok = client.post(
        "/api/v1/auth/password",
        headers=bearer(old),
        json={"current_password": PASSWORD, "new_password": "Brand-new-pass-42"},
    )
    assert ok.status_code == 200, ok.text
    fresh = ok.json()["access_token"]
    assert client.get("/api/v1/me", headers=bearer(old)).status_code == 401
    assert client.get("/api/v1/me", headers=bearer(fresh)).status_code == 200
    assert login(client).status_code == 401  # old password no longer works
    assert login(client, MAYA, "Brand-new-pass-42").status_code == 200


def test_tokens_without_a_session_id_or_tampered_are_refused(client: TestClient) -> None:
    import jwt

    legacy = jwt.encode(
        {
            "sub": "u-arjun",
            "name": "Arjun Rao",
            "role": "payroll_admin",
            "iat": 0,
            "exp": 4102444800,
        },
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    assert client.get("/api/v1/me", headers=bearer(legacy)).status_code == 401
    forged = jwt.encode(
        {"sub": "u-arjun", "jti": "x", "iat": 0, "exp": 4102444800},
        "wrong-key-wrong-key-wrong-key-32b",
        algorithm="HS256",
    )
    assert client.get("/api/v1/me", headers=bearer(forged)).status_code == 401


def test_demo_login_can_be_disabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.get("/api/v1/auth/config").json()["demo_login"] is True
    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "false")
    get_settings.cache_clear()
    try:
        assert client.get("/api/v1/auth/config").json()["demo_login"] is False
        assert client.get("/api/v1/auth/personas").json() == []
        r = client.post("/api/v1/auth/demo-login", json={"user_id": "u-maya"})
        assert r.status_code == 403
        assert login(client, "arjun.rao@kestrel.example").status_code == 200  # still works
    finally:
        monkeypatch.delenv("DEMO_LOGIN_ENABLED")
        get_settings.cache_clear()


def test_startup_backfills_credentials_for_existing_users(client: TestClient) -> None:
    from sqlalchemy import delete

    from app.bootstrap import backfill_credentials

    with session_scope() as s:
        s.execute(delete(m.UserCredential).where(m.UserCredential.user_id == "u-diego"))
    assert backfill_credentials() == 1
    assert backfill_credentials() == 0  # idempotent
    assert login(client, "diego.alvarez@kestrel.example").status_code == 200
