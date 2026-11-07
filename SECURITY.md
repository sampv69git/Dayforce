# Security

Scope: prototype for a challenge. This document describes the controls implemented and the limits of each.

## 1. Threat model (summary)

| Asset | Threat | Control |
|---|---|---|
| Timecards and pay | Unauthorised or unsafe changes | RBAC, human decision required, harness gates, append-only revisions, audit chain |
| Model behaviour | Prompt injection via employee text | Segregation, scanning, strict output schema, no tools, validation, human approval |
| Audit trail | Tampering | SHA-256 hash chain with verification |
| Secrets | Leakage | Environment variables only, `.env` git-ignored, no secrets in logs |
| API | Malformed or malicious input | Pydantic validation, length caps, unknown fields rejected |

## 2. Prompt-injection defences

1. **Least privilege:** the model has no tools, no database access, and cannot write anything. Its only output is a JSON draft.
2. **Segregation:** untrusted text (employee notes, attestation notes) is placed only in the user message inside `<untrusted_employee_text>` tags, never in the system prompt. The system prompt instructs the model to treat it as data.
3. **Scanning:** `harness/sanitize.py` normalises Unicode (NFKC), strips control and zero-width characters, caps length at 500 characters, and flags instruction-like patterns (for example "ignore previous", "system:", "you are now", fake tags, requests to approve or cite). Flags are shown in the UI and passed to gate G10.
4. **Strict output contract:** constrained decoding to `DraftResolution`; no free-form actions.
5. **Validation:** G6 restricts actions to the code-built envelope; G7 anchors timestamps to evidence; G9 enforces business guardrails; G10 checks numbers against facts and detects echoed instructions.
6. **Human approval:** nothing is applied without a manager decision.
7. **Evaluation:** 12 injection cases in the dataset; results reported in EVALUATION.md.

Limit: no defence fully prevents injection influencing model text. The controls above bound the impact to a draft that a human reviews.

## 3. Input validation

- Every request body and query parameter is a Pydantic model with `extra="forbid"`, length caps, enums, and datetime parsing.
- Responses are Pydantic models (no accidental field leakage).
- Frontend validates critical responses with Zod.
- Errors use RFC 9457 problem+json without stack traces.

## 4. Role-based access control

| Capability | Employee | Manager | Payroll admin |
|---|---|---|---|
| Read own timecard and actions | Yes | Yes | Yes |
| Submit attestation for own exceptions | Yes | No | No |
| Read exceptions and timecards | No | Own site, direct reports | All sites |
| Generate drafts, decide, bulk approve | No | Own site | All sites (escalations) |
| Approve shift swaps | No | Own site | All sites |
| Read traces | No | Own site | All |
| Read audit, verify chain | No | No | Yes |
| Admin: re-run detection, reset, switch provider, replay with fault | No | No | Yes |

Enforced by FastAPI dependencies on every route (deny by default), with tests for each 403 path. Authentication is described in section 4a.

## 4a. Authentication

| Control | Implementation |
|---|---|
| Registration | `POST /api/v1/auth/register` with name, email, site, and password creates a manager account for that site (never payroll or employee, which an administrator provisions). The contract enforces the email shape and password rules, so valid input is never refused; duplicate emails get 409. Registration does not sign in. Disable with `REGISTRATION_ENABLED=false`. Registered accounts never appear in the persona list. |
| Password sign-in | `POST /api/v1/auth/login` with email and password. Emails are matched case-insensitively. |
| Password storage | scrypt from the Python standard library (N=2^14, r=8, p=1, 16-byte random salt, 32-byte key); parameters are stored with each hash so they can be raised later. Verification is constant time. |
| Generic failures | Wrong password and unknown email return the same 401 detail ("Email or password is incorrect"); an unknown email still runs a full hash check so timing does not reveal which accounts exist. |
| Brute-force protection | After `LOGIN_MAX_ATTEMPTS` (default 5) consecutive failures the account is locked for `LOGIN_LOCKOUT_MINUTES` (default 15); the API answers 429 with `Retry-After`, even for the correct password. A successful sign-in resets the counter. |
| Sessions | HS256 JWT signed with `JWT_SECRET`, `JWT_TTL_HOURS` lifetime (default 8). Each token has a unique `jti`, and `sub`, `exp`, `iat`, and `jti` are required. |
| Sign-out | `POST /api/v1/auth/logout` records the `jti` as revoked; the token is refused until it would have expired. Expired revocations are pruned. |
| Password change | `POST /api/v1/auth/password` requires the current password and a new one that meets the policy (at least 10 characters, a letter and a number, not based on the email). Every session issued before the change is refused; the caller receives a fresh token. |
| Persona sign-in | `POST /api/v1/auth/demo-login` stays available for the demo and can be turned off with `DEMO_LOGIN_ENABLED=false`, which also empties the persona list. |
| Audit | Registrations, successful sign-ins, failures (unknown emails stored only as a truncated SHA-256), lockouts, sign-outs, and password changes are appended to the hash-chained audit log. |
| Frontend | Protected routes redirect to `/login?next=...` (same-site paths only). Any 401 ends the local session and explains why. |

Seeded synthetic accounts share the password in `SEED_USER_PASSWORD` (default documented in README) so the demo is usable; change it, and disable persona sign-in, anywhere real. Remaining production work: per-IP rate limiting at the edge, single sign-on (OIDC or SAML) with MFA, refresh-token rotation, and storing the token in an HTTP-only cookie instead of local storage.

## 5. Audit-log integrity

- `audit_events` rows are appended in the same transaction as the state change.
- `hash = sha256(prev_hash || canonical_json(event))`; the genesis `prev_hash` is 64 zeros.
- `GET /api/v1/audit/verify` recomputes the chain and reports the first mismatch.
- Limit: a party with full database write access could rewrite the entire chain. Production would anchor the chain head externally (for example, periodic signed checkpoints).

## 6. Secrets handling

- `.env` (git-ignored) holds `GROQ_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, and optionally `SEED_USER_PASSWORD`. `.env.example` has placeholders only.
- CI uses GitHub Actions secrets only for the optional real-model eval job.
- Logs never include API keys or authorisation headers.
- Pre-commit check (`gitleaks` style pattern scan in CI) for accidental secrets.

## 7. Other controls

- CORS limited to the configured web origin.
- Dependency versions pinned via lock files.
- Containers run as non-root users.

## 8. Reporting

This is a challenge prototype. Report issues through GitHub issues on the repository.
