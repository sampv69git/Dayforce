from app.auth.passwords import hash_password, policy_problems, verify_password


def test_hash_round_trip_and_unique_salts() -> None:
    a, b = hash_password("Correct-horse-42"), hash_password("Correct-horse-42")
    assert a != b and a.startswith("scrypt$16384$8$1$")
    assert verify_password("Correct-horse-42", a)
    assert not verify_password("correct-horse-42", a)


def test_malformed_hashes_never_verify() -> None:
    for bad in ("", "plain", "bcrypt$1$2$3$4$5", "scrypt$x$8$1$AA==$AA=="):
        assert not verify_password("anything", bad)


def test_policy() -> None:
    assert policy_problems("Countersign2026") == []
    assert policy_problems("short1")
    assert policy_problems("onlyletterspassword")
    assert policy_problems("maya.chen2026x", "maya.chen@kestrel.example")
