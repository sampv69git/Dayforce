# Changelog

All notable changes to this project are documented here. Format follows Keep a Changelog; versions follow Semantic Versioning.

## [Unreleased]

### Added
- Landing page replacing the persona chooser: a replayable walkthrough of one seeded exception through detection, retrieval, drafting, the ten gates, and countersignature; a before-and-after section; an animated feature bento; an interactive harness panel; results from committed evaluation reports; persona cards.
- Guided tours without a new dependency: a nine-step landing tour that starts on the first visit and can hand off to the app, and role-specific in-app tours for managers and payroll administrators. Tours never auto-start under browser automation.
- Brand design system: gradients, glass surfaces, aurora backgrounds, light-beam borders on verified drafts, number tickers, radial gauges, avatars, page headers, a visual fault-injection matrix, site readiness rings, an audit-chain strip, and a countersign burst. All motion honours reduced-motion settings.
- Unit tests for the tour engine and an end-to-end journey for the landing tour (Vitest 13, Playwright 7).
- Playwright end-to-end journeys (J1 to J5 and the landing page) with WCAG 2 A/AA axe checks.
- README rewritten for the implemented product, with screenshots in `docs/screenshots/`.

### Changed
- End-to-end journeys run with reduced motion so animated pages are deterministic for the axe checks.
- The landing page is lazy-loaded; no production chunk exceeds 500 kB.
- README screenshots regenerated from the live app with gpt-oss-20b on Groq.

### Fixed
- Accessibility findings from an axe scan of every page in light and dark themes, including an older low-contrast previous-hash label in the audit table.
- `--ink-3` darkened to #5F6470 to meet WCAG AA on tinted surfaces.
- Dense retrieval on PostgreSQL uses an explicit pgvector `<=>` query (verified on an embedded PostgreSQL).

## [0.9.0] - 2026-11-06

### Added
- Specification set: brief capture, research, project specification with traceability, architecture, harness design, model card, privacy, security, licences, testing, quality gates, demo script, slide content, and the `claude-code/` build instructions.
- Backend: FastAPI service with RBAC, problem+json errors, structured logging, trace spans, and an OpenAPI contract with drift checks.
- Rules engine: punch pairing (overnight and DST safe), 17 rules across punch integrity, schedule, meals and rest, overtime, holidays, and forecast; pay calculation; constraints envelope; counterfactual cascade linker; overtime forecast with swap candidates; evidence strength.
- Fictional policy pack v2026.2 (49 clauses) and a deterministic synthetic dataset for three sites.
- Hybrid retrieval (metadata filters, BM25, bge-small embeddings, reciprocal rank fusion, required-clause seeding).
- Harness: strict output contract, providers for Groq, Ollama, rule-based templates, and scripted faults; gates G1 to G10; one repair attempt; visible fallback and escalation; hash-chained audit.
- Decisions: approve, edit (re-validated), reject; append-only revisions; guarded bulk approval; employee attestation.
- Web app: provenance-coded design system with light and dark themes, queue, exception detail with shift ribbon, overtime forecast, harness inspector with fault replay, outcomes, evaluation, policies, payroll readiness, audit chain, weekly timecard, mobile employee screen.
- Evaluation suite with 128 labelled cases, a 12-fault matrix, and CI quality gates.

### Fixed (found by the evaluation and contract tests)
- Acknowledgements could clear punch exceptions in simulation.
- Degraded mode could show a template that failed a gate as ready.
- G9 allowed voiding a punch other than the identified duplicate.
- 405 responses lacked the `Allow` header; error responses and UTC timestamps were not documented in the contract.
