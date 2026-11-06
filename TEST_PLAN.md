# Test Plan

Each test case traces to a requirement in PROJECT.md (FR, NFR, AC) or a gate in HARNESS.md.

| ID | Requirement | Test | Type |
|---|---|---|---|
| T-01 | FR1 | Generator with same seed produces identical dataset hash | unit |
| T-02 | FR2 | Each of 17 rules: positive, negative, boundary cases | unit |
| T-03 | FR2 | Overnight shift pairing; DST fall-back shift counts 1 extra hour | unit |
| T-04 | FR3 | Re-running detection creates no duplicate open exceptions | integration |
| T-05 | FR4 | Diego span cascade links 4 symptoms; approving root resolves them | unit + integration |
| T-06 | FR5 | Priya forecast risk; Marcus is top candidate; ineligible candidates excluded with reasons | unit |
| T-07 | FR6 | Retrieval filters by jurisdiction, effective date, employee class | unit |
| T-08 | FR6 | Required clause always in results; CA override clause flagged | unit |
| T-09 | FR7 | Groq strict schema accepted by provider (live smoke, manual) | manual |
| T-10 | FR8, G1..G10 | One passing and at least one failing fixture per gate | unit |
| T-11 | FR9 | Fault matrix: each fault ends in the expected route | eval-ci |
| T-12 | FR9 | `bad_then_good` repairs on attempt 2 | unit |
| T-13 | FR10 | Edit with time outside window is rejected (G7) | integration |
| T-14 | FR10 | Reject requires reason code (422 without) | integration |
| T-15 | FR11 | Original punches unchanged after approve; revision links present | integration |
| T-16 | FR12 | Re-detection after apply supersedes cleared exceptions | integration |
| T-17 | FR13, AC6 | Audit verify passes; mutating a payload is detected at that seq | integration |
| T-18 | FR14, AC7 | Employee cannot read other timecards or decide; manager cannot act on another site | integration |
| T-19 | FR16 | Pay snapshot: CA daily OT and DT, weekly OT, meal premium, BLR 2x OT, exempt excluded | unit |
| T-20 | FR17, AC2 | Rule-based provider completes J1 | integration + e2e |
| T-21 | FR18 | Outcomes metrics computed from seeded decisions | integration |
| T-22 | NFR4, AC3 | Zero unsafe drafts reach verified status in fault suite | eval-ci |
| T-23 | Guardrail 3 | Draft adding MEAL_START without attestation fails G9 | unit |
| T-24 | Guardrail 1 | Draft voiding a worked punch without escalate fails G9 | unit |
| T-25 | Security | Injection note flagged by sanitiser; injection_echo fault fails G10 | unit |
| T-26 | Contract | Generated OpenAPI equals committed `openapi.yaml` | contract |
| T-27 | Contract | Schemathesis on all GET routes and decision routes | contract |
| T-28 | UI | GateStrip renders statuses and announces via aria-live | vitest |
| T-29 | UI | DecisionBar requires reason for edit and reject; hotkeys work | vitest |
| T-30 | AC1 | J1 in browser with real model (manual, recorded in HANDOFF) | manual |
| T-31 | J1, J3, J5 | Playwright journeys pass with no serious axe violations | e2e |
| T-32 | AC9 | `docker compose up` on clean clone: health ready, seeded queue visible | manual |
| T-33 | AC5 | Approving swap removes forecast risk and introduces no exception for either employee | integration |
