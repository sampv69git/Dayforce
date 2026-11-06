# Countersign: Features

### F1. Exception queue (manager)
- Lists the manager's open exceptions, **grouped by root cause**. For example, one card says "Two missed punches created a 32.5-hour shift" and has 4 related exceptions nested under it.
- Ranked by a **risk score**: severity × pay impact × how close the cutoff is.
- The header shows the **cutoff countdown**, a progress ring and how many items are "Ready to countersign".
- Each row shows the employee, date, rule in plain words, severity, evidence strength, pay impact and a **route badge**: *Model draft verified*, *Rule-based fallback*, *Escalated* or *Awaiting employee*.
- **Keyboard shortcuts:** `J`/`K` move, `Enter` open, `A` approve, `E` edit, `R` reject, `X` select, `Shift+A` bulk approve, `/` search, `Ctrl+K` command palette, `?` help.

### F2. Exception detail
- **Shift ribbon:** a timeline for each day showing the scheduled block, worked time, meals, punches, and badge and scanner events. Proposed punches appear as violet "ghost" pins. A Before/After toggle animates the fix.
- **Evidence panel:** badge swipes, scanner activity, the schedule and employee notes, each with a strength rating. Employee-written notes are labelled **"untrusted"**.
- **Draft card (violet = AI output):** summary, explanation, the proposed operations, and policy citations with the **exact quoted text**. It also shows the model ID and prompt version.
- **Gate strip:** the 10 harness gates, each marked pass, fail or skip with a one-line reason. The gates animate in order as they run.
- **Evidence strength:** a score the harness calculates (not the model's own confidence), with a breakdown of what it was based on.
- **Before/after pay:** regular hours, overtime, double time, premiums and cost, plus which exceptions the fix clears or introduces.
- **Cascade:** "This correction also clears: Daily overtime (Tue), Missed meal (Tue), Rest under 10 h (Wed)".
- **Decision bar:** Approve, Edit or Reject. Edit and Reject need a reason code. Approve plays a short "countersign stamp" animation.
- **Ask employee to confirm:** sends the employee an attestation request (an in-app notification, simulated).

### F3. Edit a suggestion
- An inline editor for the proposed operations. Time pickers only allow times inside the plausible window.
- Every edit is **re-validated live** through gates G6 to G9 before the manager can save it.

### F4. Guarded bulk approve
- Lets the manager approve many items at once, but only items that are low or medium severity, passed all gates, have high evidence strength, don't reduce paid hours and don't edit breaks.
- Each item still gets its own audit record.

### F5. Overtime forecast and shift swaps
- A week grid (employees × days) showing worked hours plus scheduled future hours, compared against the overtime thresholds (40 h a week; 48 h in Bengaluru; 8 h a day in California).
- For each employee heading into overtime, it ranks **colleagues who could take the shift**: same role and site, no conflict, at least 10 h rest on both sides, no 7th consecutive day, and still under the threshold.
- The model recommends one candidate. The harness re-checks the rules for **both** employees. Approving the swap changes the schedule (a simulated publish).
- This prevents overtime before it happens instead of paying for it afterwards.

### F6. Employee attestation (mobile-first)
- The employee sees "Action needed: Thu 5 Nov, missing clock-out. Badge exit at 17:42. Is that right?" They can confirm it, pick a different time or add a note.
- Their confirmation becomes strong evidence in the manager's draft.
- The note is **untrusted input**: it is scanned for prompt injection and labelled "untrusted" everywhere it appears.

### F7. Payroll admin: cutoff readiness and escalations
- Readiness by site (open, escalated and resolved items) and the pay impact that is still unresolved.
- An escalation queue with the reason for each item: conflicting evidence, policy conflict, guardrail block, or both the model and the fallback failed.
- Escalations are resolved with the same decision flow and audit trail.

### F8. Harness Inspector
- For any suggestion, it shows the full pipeline trace: Context → Retrieve → Sanitise → Generate → Validate → Repair → Route → Decide → Apply → Audit. Each step shows timings, inputs, outputs, prompt version, model, token counts, the raw versus validated output, and the gate results.
- **Replay with fault** (admin only) re-runs the pipeline with a deliberate fault: malformed JSON, an invented clause, an unquoted citation, an invented punch time, a paid-hour reduction, an injection echo or a timeout. You then watch the harness catch it and fall back.

### F9. Outcomes dashboard
- Time to decision, share resolved before cutoff, exceptions cleared per root fix, unsafe drafts blocked, overtime cost avoided and pay recovered.
- Harness health: first-pass rate, repaired, fallback, escalated, the gates that fail most often and injection attempts flagged.
- Every tile is labelled **"Measured in this environment from synthetic data"**.

### F10. Policy library and retrieval playground
- Browse policy clauses by version, jurisdiction and effective date.
- A search box runs **the same retrieval the pipeline uses** and shows the BM25, dense and fused ranks side by side.

### F11. Audit log
- Filterable, append-only event log. **"Verify chain"** recomputes the SHA-256 hashes and reports the first broken link, if there is one.

### F12. Evaluation report
- Shows the latest evaluation run: date, commit, model, dataset size and metrics. Numbers come only from real runs.

### F13. Degraded mode
- If the LLM is down or switched off, the status pill turns amber ("Rule-based mode"). Drafts then come from deterministic templates labelled "Rule-based", and approve, edit and reject all keep working.

### F14. Demo controls (admin only, labelled)
- Reset the demo data, re-run detection, switch persona, and switch the LLM provider (Groq, Ollama or rule-based).
