# Prototype Specification: Screens, Components, Interactions

This document defines exactly how every Countersign screen looks and behaves. It is the source of truth for frontend work. If the implementation diverges, update this file in the same pull request.

---

## 1. Design concept

**Provenance-coded interface.** In a governed AI product the most important question on screen is "where did this come from, and has it been checked?" Countersign answers it visually, everywhere, with a consistent system:

| Provenance | Meaning | Visual signature |
|---|---|---|
| **Rule** | Computed by the deterministic engine | Graphite text, square glyph, mono rule ID chip |
| **Model draft** | Written by the LLM, not yet verified | Violet tint surface, dotted left border, "Model draft" label, model ID in mono |
| **Verified** | Passed harness gates | Green check on the gate strip, solid border replaces dotted |
| **Human** | Decided by a named person | Cobalt countersign stamp with initials and time |
| **Simulated** | Synthetic or simulated source | Hatched badge "Simulated", always visible |
| **Untrusted** | Employee-written free text | Amber quote block with "Employee-written, untrusted" label |

The second idea is **evidence before opinion**: on the detail screen the timeline and evidence sit above the model's draft, so the manager forms a view from facts first.

The third is **calm under deadline**: the payroll cutoff countdown is always visible, but the interface stays quiet. No alarm colours except for genuinely critical items.

What we avoid: gradient hero banners, glassmorphism, decorative charts, emoji, animated counters that carry no meaning, generic "AI sparkle" iconography.

---

## 2. Design tokens

Implemented as CSS custom properties in `frontend/src/styles/tokens.css` and mapped into Tailwind v4 `@theme`. Light theme is the primary demo theme; dark theme uses the same token names.

### 2.1 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#F6F6F3` | `#0D0F12` | App background (warm paper) |
| `--surface` | `#FFFFFF` | `#14171C` | Cards, panels |
| `--surface-2` | `#F0F0EC` | `#1B1F26` | Nested surfaces, table header |
| `--line` | `#E3E3DD` | `#272C35` | Borders, dividers |
| `--line-strong` | `#C9C9C1` | `#3A404B` | Input borders, focus base |
| `--ink` | `#15171C` | `#ECEEF2` | Primary text |
| `--ink-2` | `#4A4F5A` | `#B4BAC5` | Secondary text |
| `--ink-3` | `#5F6470` | `#8F96A3` | Tertiary text, captions (AA on canvas and surface) |
| `--accent` | `#2849D6` | `#7D96FF` | Cobalt: primary actions, human decisions, focus ring |
| `--accent-soft` | `#E9EDFC` | `#1B2448` | Selected rows, accent backgrounds |
| `--model` | `#6D3FD1` | `#B49BFF` | Violet: model drafts |
| `--model-soft` | `#F3EEFD` | `#231A3D` | Model draft surfaces |
| `--ok` | `#127A52` | `#4CC38A` | Gate pass, resolved |
| `--ok-soft` | `#E7F5EE` | `#12271E` | |
| `--warn` | `#9A5B00` | `#F0B44C` | Medium severity, fallback, degraded |
| `--warn-soft` | `#FDF3E1` | `#2B2112` | |
| `--crit` | `#B42318` | `#FF7A70` | Critical, gate fail |
| `--crit-soft` | `#FCECEA` | `#2E1614` | |
| `--rule` | `#3D4350` | `#A9B0BC` | Rule provenance glyphs |

All text and icon pairs meet WCAG 2.2 AA (4.5:1 for body text, 3:1 for large text and UI components). Contrast is verified in CI with a token contrast script.

### 2.2 Typography

- **Geist Sans** (UI) and **Geist Mono** (IDs, times, numbers in tables), self-hosted from the `geist` package (SIL OFL 1.1).
- Tabular numbers (`font-variant-numeric: tabular-nums`) for all times, hours, and money.
- Scale (px / line-height): Display 28/34 (page titles, semibold, tracking -0.01em); Title 20/28; Heading 16/24 semibold; Body 14/22; Small 13/20; Caption 12/16 (medium, uppercase only for section eyebrows, tracking 0.04em); Mono 13/20.

### 2.3 Space, shape, elevation

- 4 px base grid. Common steps: 4, 8, 12, 16, 24, 32, 48.
- Radius: 6 px controls, 10 px cards, 14 px dialogs, full for pills.
- Elevation: borders do most of the work. Shadows only for overlays: `0 8px 24px -8px rgb(16 24 40 / 0.18)`.
- Layout: left rail 232 px (collapsible to 64 px); content max width 1440 px; queue split view 440 px list plus fluid detail.

### 2.4 Motion

Motion exists only to explain a change of state. Durations 120 to 240 ms, easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. `prefers-reduced-motion` disables all non-essential motion and replaces it with instant state changes.

| Moment | Motion | Why |
|---|---|---|
| Gates run | Gate pills fill left to right, 60 ms stagger | Shows the harness working in order |
| Before/After toggle | Ribbon segments morph to new positions; ghost pins solidify | Makes the correction legible |
| Approve | Countersign stamp scales from 0.9 to 1 with ink fade, 240 ms | Marks human accountability |
| Cascade cleared | Symptom rows collapse into "Resolved by root fix" chip | Shows one fix clearing many |
| Queue item resolved | Row slides out, next row receives focus | Supports fast triage |

### 2.5 Iconography

Lucide icons (ISC licence), 16 px in dense UI, 20 px in headers, stroke 1.75. Never icon-only for meaning; always paired with a label or tooltip and `aria-label`.

---

## 3. Global layout (app shell)

```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ COUNTERSIGN  │ Fri 6 Nov, 11:00 PT  Simulated clock │ Payroll cutoff in 3d 01h │ ● gpt-oss-20b · Groq │ Synthetic data │ ◐ │ MC ▾ │
│              ├───────────────────────────────────────────────────────────────────────────┤
│ ▣ Queue   23 │                                                                           │
│ ◷ Forecast  4│                         page content                                      │
│ ☰ Timecards  │                                                                           │
│ ⚖ Policies   │                                                                           │
│ ⌁ Inspector  │                                                                           │
│ ◫ Outcomes   │                                                                           │
│ ✓ Evaluation │                                                                           │
│ ── Payroll ──│                                                                           │
│ ⚑ Escalations│                                                                           │
│ ⛓ Audit      │                                                                           │
│              │                                                                           │
│ Fremont DC ▾ │                                                                           │
│ ⌘K  Search   │                                                                           │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```

- **Top bar** (56 px): simulated clock chip (hover explains "Demo clock, not real time"); cutoff countdown (turns warn colour under 24 h, crit under 4 h); LLM status pill (green "gpt-oss-20b · Groq", violet "qwen3:4b · Ollama", amber "Rule-based mode", red "Provider error, fallback active"); "Synthetic data" hatched badge; theme toggle; persona menu (switch persona, sign out).
- **Left rail:** navigation with counts; role-dependent items (Payroll section only for admin); site switcher for admin; command palette hint.
- **Command palette** (`Cmd/Ctrl+K`, cmdk): jump to page, search employee or exception ID, run actions ("Approve current", "Switch to rule-based mode", "Replay with fault").
- **Toasts** (sonner): bottom right, with undo for non-destructive UI actions only (never for decisions; decisions are final and audited).

---

## 4. Screens

### 4.1 Landing page and demo sign-in `/`

Purpose: the demo sign-in and first impression in five seconds.

Implemented as a full landing page (revision after the first build): sticky glass navigation; a hero with the tagline and a replayable walkthrough of one seeded exception (detect, retrieve, draft, ten gates, countersign) in a browser frame that straightens on scroll; a technology marquee; before-and-after; a feature bento with small animated illustrations; a dark harness panel with hoverable gates; results from committed evaluation reports; persona cards; a closing call to action. A guided tour (spotlight cutout, keyboard control) starts on the first visit and can hand off to the in-app tour. The original layout below remains the information architecture of the persona cards.

```
            COUNTERSIGN
            The model drafts. The rules verify. A manager countersigns.

  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
  │ Maya Chen          │ │ Arjun Rao          │ │ Diego Alvarez      │
  │ Manager, Fremont   │ │ Payroll admin      │ │ Associate, Fremont │
  │ 23 open exceptions │ │ 4 escalations      │ │ 2 actions needed   │
  │ [Continue →]       │ │ [Continue →]       │ │ [Continue →]       │
  └────────────────────┘ └────────────────────┘ └────────────────────┘
  + Ananya Iyer (Bengaluru), Jordan Reyes (Austin)

  Synthetic data · Fictional company "Kestrel Logistics" · Not legal advice
```

- Cards are buttons (keyboard 1 to 3). Below the fold: a three-step diagram (Rules detect, Model drafts, Harness verifies, You countersign).

### 4.2 Exception queue `/queue` (primary screen)

```
┌ Queue ────────────────────────────────────────────────────────────────────────────────────┐
│ Exceptions · Fremont DC · Week of 2 Nov            ◔ 8 of 31 resolved · 9 ready to countersign │
│ [All 23] [Ready 9] [Needs you 6] [Awaiting employee 2] [Escalated 1]   Family ▾ Severity ▾  / │
├───────────────────────────────────────┬───────────────────────────────────────────────────┤
│ ▌CRIT  Diego Alvarez  Tue 3 Nov       │  (detail panel of the selected exception,          │
│   32.5 h span · two missed punches    │   same content as 4.3 in a scrollable pane)        │
│   Fixes 4 related ▸   ● Verified  High│                                                    │
│     └ Daily overtime  Tue    (symptom)│                                                    │
│     └ Missed meal     Tue    (symptom)│                                                    │
│ ▌HIGH  Priya Natarajan Wed 4 Nov      │                                                    │
│   Missed meal, 6.5 h shift            │                                                    │
│   ● Verified  Medium  +1.0 h premium  │                                                    │
│ ▌HIGH  Diego Alvarez  Thu 5 Nov       │                                                    │
│   Missing clock-out  ⚠ Untrusted note │                                                    │
│ ▌LOW   6 × Late arrival               │                                                    │
│   [Select all eligible] Shift+A       │                                                    │
└───────────────────────────────────────┴───────────────────────────────────────────────────┘
 J/K move · Enter open · A approve · E edit · R reject · X select · ? shortcuts
```

Row anatomy: 3 px severity bar (crit, high, medium, low use colour plus label text); employee name; date; plain-language title; one-line evidence summary; route badge (`Verified` green, `Rule-based fallback` amber with icon, `Escalated` crit outline, `Awaiting employee` neutral, `Not drafted` grey); evidence strength pill; pay impact in mono.

Behaviour:
- Root rows expand and collapse symptoms (symptoms are not individually actionable while their root is open; tooltip explains).
- Drafts are generated lazily: when a row is selected and has no draft, the detail shows the pipeline progress (stages tick through) and then the result. A background "Prepare drafts" button drafts the top 10 by risk.
- Filters persist in the URL query string.
- Empty state: "All clear for this period. 31 exceptions resolved, 27 before cutoff." with link to Outcomes.
- Error state: inline panel with retry and request ID.
- Loading: skeleton rows (no spinners for lists).

### 4.3 Exception detail `/exceptions/:id`

Vertical order is deliberate: facts, then model, then decision.

```
┌ Header ───────────────────────────────────────────────────────────────────────────────────┐
│ ← Queue   EXC-FRE-0012  R-PUNCH-SPAN ▣ Rule                                ⌁ Inspect trace  │
│ Diego Alvarez · Associate, Fremont · Non-exempt · USD 24.50/h                               │
│ Two missed punches joined Tuesday and Wednesday into one 32.5 h span        CRITICAL        │
├ Timeline ─────────────────────────────────────────────────────────────── [Before | After] ┤
│        00   03   06   09   12   15   18   21   24                                         │
│ Mon 2  ········[▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒]·····························  8.0 h                       │
│ Tue 3  ·······|███████████████████████████████████████████→   (scheduled 07:00 to 15:30)   │
│               ▲06:58 IN          ◆15:22 scan  ▮15:34 badge exit   ◌ 15:34 OUT (proposed)    │
│ Wed 4  ███████████████████████████|·································                      │
│        ▮06:52 badge entry ◌06:52 IN (proposed)     ▼15:31 OUT                               │
│ Legend: ▒ scheduled  █ worked  ▲▼ punch  ◌ proposed  ▮ badge  ◆ scanner                     │
├ Evidence ──────────────────────────────┬ Week totals ─────────────────────────────────────┤
│ ▮ Badge exit 15:34 Dock Door 3  Strong  │            Before    After     Δ                  │
│ ◆ Scanner last activity 15:22   Medium  │ Regular    40.0      38.5     -1.5               │
│ ▒ Scheduled end 15:30           Weak    │ Overtime   12.6       0.0    -12.6               │
│ ▮ Badge entry Wed 06:52         Strong  │ Premiums    1.0       0.0     -1.0               │
│ (Simulated feeds)                        │ Cost USD 1,543  →  943      -600                 │
├ Model draft ───────────────────────────────────────────────── Model draft · gpt-oss-20b ──┤
│ ┊ Two missed punches joined Tuesday and Wednesday into one span.                            │
│ ┊ Add OUT Tue 15:34 and IN Wed 06:52, both from badge events.  [TA-3.4] [TA-3.2]           │
│ ┊  Proposed operations                                                                       │
│ ┊   + OUT  Tue 3 Nov 15:34  ← badge:B-5521                                                   │
│ ┊   + IN   Wed 4 Nov 06:52  ← badge:B-5530                                                   │
│ ┊  "a missing punch may be added only at a time supported by independent evidence" TA-3.2   │
│ ┊  Model's own estimate: high (not used for routing)        prompt draft.v1                  │
├ Harness ──────────────────────────────────────────────────────────────────────────────────┤
│ G1✓ G2✓ G3✓ G4✓ G5✓ G6✓ G7✓ G8✓ G9✓ G10✓   Verified on attempt 1 · 2.4 s                   │
│ Evidence strength ███████████░ 0.86 High   (badge 0.45 · scanner 0.25 · schedule 0.15 ...)  │
│ This correction also clears: Daily overtime (Tue) · Missed meal (Tue) · Rest under 10 h ... │
├ Decision ─────────────────────────────────────────────────────────────────────────────────┤
│ [Approve  A]  [Edit  E]  [Reject  R]      [Ask Diego to confirm]                             │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Behaviour:
- Citation chips open a popover with the clause title, full text, document, effective dates, and the quoted span highlighted.
- Gate pills: hover shows detail; a failed gate shows the reason in red text and the route banner explains what happened ("Model draft rejected by the harness at G5 (quote not found). Showing the rule-based suggestion."). Fallback drafts use the amber "Rule-based fallback" label instead of violet.
- Before/After toggle animates the ribbon; keyboard `B` toggles.
- Approve opens no dialog for verified drafts (single key), but shows an inline confirm row for critical severity ("Approve 2 punch additions for Diego Alvarez? Enter to confirm").
- Edit turns operations into editable rows: time inputs constrained to the plausible window with evidence quick-picks; gates G6 to G9 re-run live (debounced 300 ms); Save disabled until they pass; reason code select required.
- Reject: reason code select plus optional note; exception returns to "Needs you" with the rejected draft visible in history.
- After a decision: stamp animation, toast "Countersigned. 4 related exceptions resolved.", focus moves to next queue item.
- History tab: all runs and decisions for this exception.

### 4.4 Overtime forecast `/forecast`

```
┌ Overtime forecast · Fremont DC · Week of 2 Nov ────────────── Projected OT cost USD 1,180 ┐
│ Employee        Mon  Tue  Wed  Thu  Fri  Sat  Sun   Worked  Scheduled  Projected  │40h      │
│ Priya N.        8.0  8.0  8.5  8.0 [8.0][8.0]  ·     32.5    16.0       48.5 ████████│██ +8.5│
│ Marcus T.       8.0   ·   8.0  7.5 [8.0]  ·    ·     23.5     8.0       31.5 ██████  │       │
│ ...                                                                                        │
├ Risk: Priya Natarajan, +8.5 h overtime (USD 312) ─────────────────────────────────────────┤
│ Candidates for Sat 7 Nov 07:00 to 15:30 (Picker)                                            │
│  1 Marcus Taylor   headroom 8.5 h → 40.0 h   rest 14 h / 39 h   ✓ role ✓ site ✓ 7th day   │
│  2 Lena Park       headroom 6.0 h → 42.0 h   ✗ would exceed 40 h                             │
│ Model draft: "Reassign Saturday to Marcus Taylor ..." [TA-4.2]   G1..G10 ✓                  │
│ [Approve reassignment]  [Approve overtime instead]  [Reject]                                │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- Future shifts shown in brackets with dashed outline; worked hours solid.
- Threshold line at 40 h (48 h Bengaluru); daily 8 h marker for California.
- Approving shows the projection update with animation; the risk row turns into "Prevented, saved USD 312 (projected)".

### 4.5 Weekly timecard `/timecards/:employeeId`

- Seven-day shift ribbon (same component as detail), daily totals, weekly totals, pay breakdown, list of open and resolved exceptions, revision history (original punches never disappear; voided punches show struck through with the decision link).

### 4.6 Payroll: cutoff readiness and escalations `/payroll`

```
┌ Cutoff readiness ── Mon 9 Nov 12:00 PT (3d 01h) ──────────────────────────────────────────┐
│ Site        Open  Escalated  Resolved  Unresolved pay impact   Ready?                      │
│ Fremont      15       1         16       USD 2,340              ○                          │
│ Austin        6       0          9       USD   410              ○                          │
│ Bengaluru     9       2         11       INR 18,600             ○                          │
├ Escalations ──────────────────────────────────────────────────────────────────────────────┤
│ ⚑ Conflicting evidence · Sam Okafor Wed 4 Nov · badge 15:10 vs scanner 17:20   [Open]     │
│ ⚑ Model and fallback failed · ...                                                [Open]     │
│ ⚑ Policy conflict · CA-4.1 overrides TA-5.1 ...                                  [Open]     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Opening an escalation shows the detail screen with an "Escalation reason" banner and the same decision bar.

### 4.7 Harness inspector `/inspector/:runId`

```
┌ Run RUN-0187 · EXC-FRE-0012 · gpt-oss-20b (Groq) · prompt draft.v1 · 2.41 s ── [Replay with fault ▾] ┐
│ ●─ Context        12 ms   envelope: 2 allowed ops, window 13:00..21:00, 4 evidence items   ▸│
│ ●─ Retrieve       38 ms   5 clauses (TA-3.4 required) · BM25 / dense / fused ranks         ▸│
│ ●─ Sanitise        1 ms   untrusted text: none                                             ▸│
│ ●─ Generate     2180 ms   in 1,412 tok · out 286 tok · strict schema                       ▸│
│ ●─ Validate       64 ms   10/10 gates passed                                               ▸│
│ ●─ Route           0 ms   SUGGEST                                                          ▸│
│ ○─ Decide              waiting for manager                                                  │
├ Selected: Generate ───────────────────────────────────────────────────────────────────────┤
│ [Prompt] [Raw output] [Parsed] [Diff raw vs validated]                                      │
│ { "exception_id": "EXC-FRE-0012", ... }                                                     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- Timeline waterfall bars proportional to duration.
- Each span expands to inputs and outputs (JSON viewer with copy).
- Replay with fault (admin): choose fault, run, and watch new run appear with failing gate highlighted, repair attempt, final route. Shows side by side "Original run" vs "Fault replay".
- `/inspector` index: recent runs table with route, gates failed, latency, provider; filters by route and gate.

### 4.8 Outcomes `/outcomes`

Tiles (each with a caption naming the data source):
1. Resolved before cutoff (ring) and open count.
2. Median time to decision (from audit) with distribution sparkline.
3. Exceptions cleared by root fixes (count, and "1 decision cleared N" largest).
4. Paid hours recovered and value.
5. Overtime: projected cost flagged, cost avoided by approved swaps.
6. Premiums surfaced (meal, holiday).
7. Harness health: drafts, first-pass verified %, repaired %, fallback %, escalated %; bar chart of failing gates; injection attempts flagged.
8. Provider mix and latency p50/p95.

Charts (Recharts) follow the dataviz rules: direct labels, no 3D, no pie charts with more than three slices, accessible colours from tokens, tables available behind each chart ("View data").

### 4.9 Policies `/policies`

- Left: documents and clause tree with version and jurisdiction filters. Right: clause reader with metadata (effective dates, applicability, precedence).
- Retrieval playground: query box plus employee context selector (site, class, date); results table with BM25 rank, dense rank, fused score, and "required" or "override" flags. Same code path as the pipeline.

### 4.10 Audit `/audit` (admin)

- Table: seq, time, actor, role, event, entity, hash (short). Row expands to payload JSON.
- "Verify chain" button: runs verification, shows "Chain intact: 412 events verified" or the first broken sequence number.

### 4.11 Evaluation `/evaluation`

- Header with run metadata (date, commit, provider, model, dataset size, duration) and a label "Results from a real run in this repository".
- Sections: detection (per-rule precision/recall table), retrieval (recall@5 and MRR for BM25, dense, hybrid), generation (schema-valid first pass, citation accuracy, quote grounding, re-check pass, correction accuracy), routing (suggest, fallback, escalate), safety (fault-injection matrix, injection cases), latency (p50/p95), harness ablation (unsafe drafts without vs with harness).
- If no report exists: empty state "No evaluation run yet. Run `make eval`."

### 4.12 Employee `/me` (mobile-first, 360 px and up)

```
┌──────────────────────────────┐
│ Hi Diego                      │
│ Week of 2 Nov · 38.5 h so far │
│ ── Action needed (2) ──────── │
│ Thu 5 Nov · Missing clock-out │
│ Badge exit at 17:42           │
│ Dock Door 3 (simulated feed)  │
│ Is this when you left?        │
│ [Yes, 17:42] [Different time] │
│ Add a note (optional)         │
│ ┌──────────────────────────┐  │
│ └──────────────────────────┘  │
│ Your manager approves changes │
│ ── This week ──────────────── │
│ Mon 8.0 h · Tue 8.0 h ...     │
└──────────────────────────────┘
```

- Large touch targets (44 px minimum). Note field max 500 characters with counter.
- After submit: "Sent to Maya for approval" and the item moves to "Waiting for manager".

---

## 5. Core components

| Component | Props (essentials) | Notes |
|---|---|---|
| `ShiftRibbon` | days, schedules, punches, evidence, proposedOps, mode (before/after), tz | SVG, responsive width, keyboard focusable markers with tooltips, `role="img"` with a text summary for screen readers |
| `GateStrip` | gates[], running | Pills with status icon and label; aria-live polite announcements |
| `DraftCard` | draft, provenance (model, fallback, rule-based) | Violet or amber variant |
| `CitationChip` | clauseId, quote | Popover with full clause |
| `EvidenceList` | items | Strength meter and source label, simulated badge |
| `EvidenceStrength` | score, factors | Bar plus breakdown popover |
| `PayDelta` | before, after, currency | Table with signed deltas, tabular numbers |
| `CascadeList` | clears[], introduces[] | Introduces[] must be empty to approve |
| `DecisionBar` | draft, onDecide | Hotkeys, reason codes, confirm for critical |
| `CountersignStamp` | initials, at | Motion component, reduced-motion fallback |
| `RouteBadge` | route | Verified, Repaired, Fallback, Escalated, Manual |
| `SeverityBar`, `SeverityLabel` | severity | Colour plus text |
| `UntrustedQuote` | text, flags | Amber block, injection flag chip |
| `CutoffCountdown` | cutoffAt, now | Simulated clock aware |
| `ProviderPill` | status | Links to admin provider switch |
| `TraceWaterfall` | spans | Inspector |
| `JsonView` | value | Collapsible, copy |
| `KpiTile` | label, value, caption, source | Outcomes |

shadcn/ui primitives used: Button, Badge, Card, Dialog, Popover, Tooltip, Tabs, Select, Input, Textarea, Table, Sheet, DropdownMenu, Command, Skeleton, Separator, ScrollArea, Toggle.

---

## 6. States, accessibility, responsiveness

- **Loading:** skeletons for lists and panels; pipeline progress for drafts (stage names tick through, aria-live).
- **Empty:** every list has a written empty state that says what happens next.
- **Error:** problem+json `title` and `detail` shown with request ID and retry. Provider failure never blocks the workflow (fallback route).
- **Accessibility:** semantic landmarks; skip link; visible 2 px cobalt focus ring with 2 px offset; all actions keyboard reachable; shortcuts discoverable (`?`); colour never the only signal; timeline has a tabular alternative ("View as table"); motion respects reduced-motion; forms labelled; live regions for async results. Checked with axe in Playwright.
- **Responsive:** 1440 and up: split view; 1024 to 1439: split view with narrower list (360 px); 768 to 1023: list and detail as separate routes; under 768: manager screens show a simplified stacked layout; employee screen designed for 360 px.

---

## 7. Navigation flows

```
/ (persona) ──Maya──> /queue ──select──> detail pane ──Inspect──> /inspector/:runId
                         │                    └──Decide──> next item
                         ├──> /forecast ──approve swap──> projection updates
                         ├──> /outcomes, /evaluation, /policies
/ ──Arjun──> /payroll ──open escalation──> /exceptions/:id ──decide──> /payroll
                         └──> /audit (verify chain)
/ ──Diego──> /me ──confirm──> /me (waiting for manager)
```

Persona switch keeps the current page where permitted, otherwise redirects to that persona's home.
