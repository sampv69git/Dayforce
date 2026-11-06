# Release Checklist (v1.0.0 submission)

## Product
- [ ] J1 to J5 work end to end with gpt-oss-20b (Groq)
- [ ] Degraded (rule-based) mode works end to end
- [ ] Fault replay shows visible fallback in the inspector
- [ ] Demo data reset produces the planted scenarios

## Evidence
- [ ] `eval/reports/` contains CI, Groq, and Ollama runs with date, commit, model
- [ ] `EVALUATION.md` numbers match the committed reports exactly
- [ ] Outcomes dashboard captions name their data source

## Engineering
- [ ] CI green on `main`
- [ ] `openapi.yaml` regenerated, no drift
- [ ] `docker compose up` works on a clean clone
- [ ] No-Docker path works (`make dev`)
- [ ] No secrets in history (secret scan clean); `.env` not committed

## Documentation
- [ ] README: problem, user journey, architecture, key decisions, setup, demo video link
- [ ] All root docs consistent with implementation (spot-check gates, rules, routes, screens)
- [ ] THIRD_PARTY.md matches lock files
- [ ] CHANGELOG.md v1.0.0
- [ ] HANDOFF.md (root and `claude-code/`) final

## Deliverables
- [ ] 10-minute demo video recorded, uploaded, linked in README, and playable without sign-in
- [ ] Five-slide deck exported to `docs/presentation/` covering exactly the five brief topics
- [ ] Git tag `v1.0.0` pushed
- [ ] Commit authors show only the owner's identity; no co-author trailers
