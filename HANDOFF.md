# Handoff

Project-level handoff for reviewers and teammates. The detailed working log is `claude-code/HANDOFF.md`.

## Current state (Fri 6 Nov 2026, afternoon IST)

- The product is implemented end to end: rules engine, retrieval, harness, API, web app, evaluation suite, and tests. See README for the journey, screenshots, and how to run it.
- Without a Groq key the app runs in rule-based mode, which is fully usable and verified by the same gates.
- Remaining: real-model evaluation, the demo recording, the slide deck, and two CI jobs that need a token with `workflow` scope.

## How to continue

1. Read `README.md`, `HARNESS.md`, and `claude-code/CLAUDE.md`.
2. Run the app (README, "Run it") and walk through `DEMO_SCRIPT.md`.
3. Record progress in `claude-code/HANDOFF.md` and decisions in `claude-code/DECISION.md`.

## Access

- Repository: https://github.com/sampv69git/Dayforce
- Secrets live only in local `.env` files (Groq key, JWT secret) and are never committed.
