"""Password hashing with scrypt from the standard library (no extra dependency).

Stored format: ``scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>``. Parameters travel with the hash so
they can be raised later without invalidating existing passwords.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

N, R, P, DKLEN = 2**14, 8, 1, 32
_MAXMEM = 64 * 1024 * 1024

MIN_LENGTH = 10
MAX_LENGTH = 128


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=DKLEN, maxmem=_MAXMEM
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(_derive(password, salt, N, R, P))}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check. Malformed hashes never verify."""
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        actual = _derive(password, base64.b64decode(salt_b64), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Verifying against this keeps the response time the same when the email is unknown.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def policy_problems(password: str, email: str | None = None) -> list[str]:
    """Reasons a new password is not acceptable (empty when it is)."""
    problems: list[str] = []
    if len(password) < MIN_LENGTH:
        problems.append(f"Use at least {MIN_LENGTH} characters.")
    if len(password) > MAX_LENGTH:
        problems.append(f"Use at most {MAX_LENGTH} characters.")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        problems.append("Include at least one letter and one number.")
    if email and email.split("@")[0].lower() in password.lower():
        problems.append("Do not include your email name.")
    return problems
