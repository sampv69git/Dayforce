# Research

Date of research: 2026-11-06 (IST). Researcher: Countersign team.
Scope: domain (how timekeeping exceptions arise and get resolved), regulation (reference only), existing products, open-source and competing repositories, and technical choices for a governed LLM feature.

## How to read this document

Every finding carries one of three evidence labels:

- **[Verified]**: confirmed from a primary source (official documentation, statute or regulator page, model card, source code) that we opened ourselves on the research date.
- **[Secondary]**: reported by a reputable secondary source (law firm, trade press, vendor help article from a customer organisation). Plausible but not checked against the primary source.
- **[Unverified]**: a marketing claim, a single blog post, or something we could not confirm. Never used as a product fact.

Regulation is used only to inspire a **fictional company policy pack**. Countersign never claims legal compliance.

---

## 1. Domain: how timecard exceptions arise and get resolved

### 1.1 Exception types seen in practice

| Exception | How it arises | Typical resolution | Who resolves |
|---|---|---|---|
| Missing OUT punch | Employee forgets to clock out, device offline, shift ended at another terminal | Manager adds an OUT punch at a supported time, often with employee confirmation | Manager, with employee confirmation |
| Missing IN punch | Clocked in at a broken terminal, started work before reaching the clock | Manager adds an IN punch at a supported time | Manager, with employee confirmation |
| Unpaired or implausible span | Two missed punches in a row join two shifts into one 30-hour "shift" | Split into two shifts using evidence; downstream overtime and break exceptions disappear | Manager |
| Duplicate punch | Double tap on a terminal | Void the later punch | Manager or automatic rule |
| Late arrival or early departure | Real lateness, traffic, schedule drift | Acknowledge, excuse with a reason, or apply attendance points | Manager |
| Unscheduled shift | Covering for a colleague, schedule not updated | Approve and attach to a schedule, or escalate | Manager |
| Missed, late, or short meal | Busy shift, no relief cover | Record the premium owed where policy requires it; never edit break punches to hide the violation | Manager, payroll |
| Daily or weekly overtime | Long shifts, extra shifts, swaps | Approve and pay worked time; for future shifts, rebalance the schedule | Manager |
| Insufficient rest between shifts | "Clopening" (close then open) | Acknowledge, pay any premium, adjust future schedule | Manager, scheduler |
| Seventh consecutive day | Coverage gaps | Approve with the correct premium, or reschedule | Manager |
| Holiday work | Scheduled on a company holiday | Apply holiday premium, confirm approval | Manager, payroll |

**Evidence for this table**

- A Dayforce customer's internal guide says a missing punch-out is the most common timesheet error, that managers find them under **Timesheets > Problems**, and that Dayforce will not pay shifts with punch errors. **[Secondary]** Source: Mister Car Wash help desk, "How to review/correct Dayforce time entry errors", https://mistercarwash-helpdesk.freshservice.com/support/solutions/articles/31000035833
- A Dayforce supervisor guide lists checks before authorising: missed or incorrect punches, overtime accuracy, meal and rest break recording, and pending exception or correction requests. **[Secondary]** Source: https://leedswestgroups.happyfox.com/kb/article/97-how-do-i-authorize-timesheets-in-dayforce-as-a-supervisor
- UKG shows missed punches as a solid red cell. Managers right-click the cell to open Punch Actions, and the correction is logged in the Audits tab. Adding a pay code resolves unexcused absences. **[Verified]** Source: UKG, "Resolve timecard exceptions (hourly timecard)", https://sso-hlp01.mykronos.com/help/en_US/Content/Timekeeping/Exceptions-hourlyTC.htm and https://library.ukg.com/AuthoringOutput/ResolveTCExceptionsHourlyTC-b.html
- University job aids for PeopleSoft and Workday describe "high" exceptions that must be resolved before time is paid, and recommend reviewing all exceptions before the week closes. **[Secondary]** Sources: https://resources.uta.edu/business-affairs/training/files/tcp/timekeeper-manager/Job-Aid-Addressing-Time-Sheet-Exceptions.pdf, https://www.valdosta.edu/administration/finance-admin/payroll/managing-timesheet-exceptions.pdf
- An ADP Workforce Now supervisor guide says exceptions that do not affect payroll (for example, clocked in late) no longer need acknowledgement. This supports our severity model: separate pay-affecting exceptions from informational ones. **[Secondary]** Source: https://my.sjcme.edu/wp-content/uploads/Human_Resources/Files/NewEssentialTimeSupervisors.pdf

### 1.2 Who resolves what

- **Employee:** first-hand knowledge of when they actually started and stopped. In most products the employee can only *request* a correction; the manager approves. UKG's Bryte Time Punch Agent asks for confirmation before recording any punch, and UKG states Bryte does not change timesheet records directly. **[Verified]** Source: https://www.ukg.com/products/ai-transparency-cards/time-punch-agent and https://www.ukg.com/products/ai-transparency-cards/my-timesheet-agent
- **Line manager:** accountable for approving the timecard before the cutoff. Owns most corrections.
- **Payroll administrator:** owns the cutoff, handles escalations (conflicting evidence, policy conflicts, retroactive corrections after a period closes), and audits changes.

### 1.3 What happens when exceptions are missed

- **Unpaid or wrongly paid time.** If a shift with a punch error is not paid (as in the Dayforce guide above), the employee is underpaid for that period. **[Secondary]**
- **Wage claims and class actions.** Seyfarth reported a Washington healthcare company ordered to pay about USD 98.3 million to roughly 33,000 workers over meal break and timeclock rounding practices, including missed second meal breaks on shifts over ten hours. **[Secondary]** Source: https://www.seyfarth.com/news-insights/washington-healthcare-company-ordered-to-pay-workers-almost-dollar100m-for-missed-meal-breaks-unpaid-time.html
- **Scale of exposure.** EPI cites the top ten wage and hour class action settlements at USD 434.3 million in 2025, based on Duane Morris reports. **[Secondary]** Source: https://www.epi.org/?p=322760
- **Manipulation risk.** Editing break punches so a missed meal "disappears" removes the record of a premium the employee is owed. Our guardrails forbid break edits without employee attestation (see HARNESS.md). This is a design principle inferred from the meal-premium rules below, not a cited statistic.

---

## 2. Regulation (reference only; inspiration for a fictional policy pack)

| Topic | Reference rule | Status |
|---|---|---|
| US federal weekly overtime | FLSA: at least 1.5x regular rate for hours over 40 in a workweek. A workweek is a fixed, recurring 168-hour period. Averaging across weeks is not permitted. | **[Verified]** US DOL Fact Sheet 23, https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay |
| US federal daily overtime | The fact sheet applies overtime on a workweek basis and does not set a daily threshold. | **[Verified]**, same source (absence of a daily rule is our inference from the text) |
| US federal meal breaks | Not addressed in Fact Sheet 23. | **[Verified]** absence in that source only |
| California daily overtime | 1.5x after 8 hours in a workday up to 12, and for the first 8 hours on the seventh consecutive day; 2x after 12 hours, and after 8 hours on the seventh consecutive day; 1.5x over 40 in a workweek. | **[Verified]** CA DIR DLSE overtime FAQ, https://www.dir.ca.gov/dlse/faq_overtime.htm |
| California meal periods | 30-minute meal period for shifts over 5 hours, starting before the end of the fifth hour; second meal for shifts over 10 hours. Missed or late meal owes one hour of pay at the regular rate (Labor Code 226.7). At most one meal premium and one rest premium per day. | **[Secondary]** Sources: https://law.justia.com/codes/california/code-lab/division-2/part-1/chapter-1/article-1/section-226-7-d-1, https://calchamberalert.com/2021/04/23/premium-pay-penalty-due-when-employee-given-late-meal-break/ |
| India labour codes | The four labour codes (Wages, Industrial Relations, Social Security, OSHWC) took effect on 21 November 2025. Reported limits: 8 hours a day and 48 hours a week, overtime with consent at twice the ordinary rate. Sources disagree on daily limits and spread-over, and state rules are still being notified. | **[Secondary]** Sources: https://www.business-standard.com/india-news/labour-codes-labour-laws-ministry-of-labour-central-govt-125112100754_1.html, https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/alerts-hub/2025/11/new-labour-codes-implemented-across-the-country-effective-21-november-2025.pdf |
| Rest periods and breaks (India) | 30-minute rest interval after 5 continuous hours is widely reported (Factories Act heritage). | **[Secondary]**, conflicting figures |

**How we use this:** the fictional "Kestrel Logistics Time and Attendance Policy" (see `DATA_SOURCES.md`) has a company handbook plus a California site addendum and a Bengaluru site addendum. Thresholds are *inspired by* the rules above. The UI and documentation always say "fictional policy pack, not legal advice".

---

## 3. Existing products

| Product | How exceptions surface | Resolution workflow | AI features (documented vs marketing) |
|---|---|---|---|
| **Dayforce** | Timesheets "Problems" view lists punch errors; supervisors authorise timesheets after reviewing exceptions **[Secondary]** | Manager corrects punches, then authorises; shifts with punch errors are not paid **[Secondary]** | Dayforce AI Agents announced Nov 2024, inside Dayforce Co-Pilot, spanning HR, Pay, Time, Talent; expanded Oct 2025 with AI Workspace; shift swapping named as an example multi-step task **[Verified press release]**, https://www.dayforce.com/who-we-are/newsroom/dayforce-introduces-new-dayforce-ai-agents-to-accelerate-how-work-gets-done. A "time agent checks entries against policy" claim comes from a third-party blog **[Unverified]** |
| **UKG Pro WFM / Ready** | Red exception cells, exception indicators, Manage Timecards tile **[Verified]** | Right-click Punch Actions; audit tab; pay codes for absences **[Verified]** | Bryte (May 2025). Transparency cards: My Timesheet Agent compares scheduled vs actual and flags overtime, cannot edit timesheets; Time Punch Agent surfaces missed punches and asks for confirmation **[Verified]**. Meal and Break agent alerts managers **[Secondary, Nucleus Research]** |
| **Workday Time Tracking** | ML "time anomaly" detection in the Review Time report with an anomaly confidence score; recommends 1 year of Time Tracking history and about 3 weeks of model training **[Verified admin guide]**, https://doc.workday.com/admin-guide/en-us/human-capital-management/time-tracking/reviewing-and-approving-time/kdq1619117562220.html | Approver reviews flagged entries | No 2025 timecard-agent announcement found **[Verified absence in our search only]** |
| **ADP Workforce Now** | Timecard Exceptions page under My Team; Home tab summary of employees with exceptions per pay period **[Secondary]** | Manager resolves per exception type | "ADP Assist" timecard role not confirmed **[Unverified]** |
| **Deputy** | Timesheets need manager approval before payroll export; opt-in auto-approval per location within a variance; auto-closed timesheets excluded **[Verified]**, https://help.deputy.com/hc/en-au/articles/4973093941007 | Approve, or auto-approve within variance | None found specific to exceptions |

### 3.1 What incumbents do well

- Exceptions are surfaced where approval happens (timecard grid), with colour-coded severity.
- Every correction is audited.
- UKG's transparency cards are a strong pattern: they state plainly what each agent can and cannot do.

### 3.2 Gaps we can address (opportunity, our analysis)

1. **Exceptions are treated one at a time.** We found no documentation of root-cause grouping: one missed pair of punches can create overtime, meal, and rest exceptions that disappear once the root is fixed.
2. **Suggested times rarely show evidence.** Products tell the manager *that* a punch is missing, not *what time is supported* by independent signals (door badge, scanner logins).
3. **Pay impact is invisible at decision time.** Managers approve without seeing the overtime, premium, and cost consequence of a correction.
4. **AI confidence is opaque.** Workday exposes an anomaly confidence score from an ML model; LLM agents typically do not show *why* a suggestion is trustworthy. Research shows verbalised LLM confidence is often overconfident (Xiong et al. 2023, https://arxiv.org/abs/2306.13063 **[Secondary summary]**; arXiv 2509.25532 **[Secondary summary]**). We compute confidence from evidence instead.
5. **Overtime is detected after the fact.** Forecasting from remaining scheduled shifts lets managers act before overtime is worked.

---

## 4. Open-source and competing repositories (code inspected, not READMEs)

Searched GitHub on 2026-11-06 for: `dayforce challenge`, `dayforce ai`, `timecard exception`, `timesheet anomaly detection`, `attendance anomaly llm`, `harness engineering llm`.

### 4.1 DayForce-AIIC/Time-Attandance-Agent (same use case, likely another challenge team)

https://github.com/DayForce-AIIC/Time-Attandance-Agent, last push 2026-11-05. We read `backend/app/validator.py`, `engine/rules.py`, `llm/prompt.py`, `llm/faults.py`, `policies.json`, `docs/DESIGN_SYSTEM.md`, both eval reports, and the commit history.

- **Implemented (verified in code):** FastAPI backend, Supabase/Postgres migrations, a rules engine with about 15 rule IDs (PUNCH-01..04, OT, BRK, MAX-01, rest, consecutive days), a validator with ten checks (V-01 schema to V-10 injection echo), re-detection simulation of the proposed correction, a fault-injecting mock LLM (garbage, timeout, bad citation, always bad, bad then good), hash-chained audit drawer, an eval runner with an independent oracle, React frontend with an SVG timecard timeline, an assistant chat page, auth, and a PPTX deck. 15+ commits with PR merges and CI.
- **Policy model:** each rule ID *is* the policy ID (for example `PUNCH-01` text "Time & Attendance Policy 2.1 ..."). Retrieval is effectively a lookup by rule ID, so "100% citation accuracy" is largely guaranteed by construction.
- **Real-model results (their report):** Ollama `qwen2.5:3b-instruct`, 48 cases: first-pass validation 78.3%, final LLM pass 84.8%, safe fallback 15.2%, p95 latency about 11 s. Their mock-model run reports 100% on everything.
- **Proposed times:** few-shot example uses the scheduled end as evidence. No independent evidence signals found.
- **UI:** navy sidebar, blue brand, green primary buttons, Inter typography; conventional enterprise styling.
- **What this means for us:** the baseline pipeline (detect, retrieve, generate, validate, fall back, approve, audit) is table stakes. Differentiation must come from product insight (root-cause cascades, evidence-anchored times, pay impact, forecasting), from genuinely non-trivial retrieval (separate clause IDs, multi-document precedence, measured recall), from stronger grounding checks (verbatim quote verification, numeric fact checks), and from a distinctive, harness-visible UI.

### 4.2 Other repositories

| Repository | What the code actually contains | Relevance |
|---|---|---|
| rakshithachannakeshav/DAYFORCE-TEAM-3 | One commit (2026-11-05): CI workflow, Pydantic schemas, sample requirements. Use case 2. | Another challenge team, early stage |
| Roygrh/payroll-exception-triage-copilot | Python, LangGraph, hybrid retrieval with local embeddings, a synthetic collective agreement corpus, eval manifest, ADRs including "LLM never computes" and "action policy owned by code". | Strong ideas that agree with ours: the LLM never computes pay; code owns allowed actions |
| hsiangting49/AI-HR-Timecard-Assistant | Streamlit app plus a single `rule_engine.py`; no tests, no LLM harness. | Low |
| salmantufail459/workforce-anomaly-detector | Isolation Forest demo on timesheets. | Unsupervised anomaly detection is less explainable than rules for compliance |

---

## 5. Technical research

### 5.1 Open-weight models for reliable structured output

| Model | Licence | Structured output support | Fit |
|---|---|---|---|
| **gpt-oss-20b** (21B total, 3.6B active MoE, runs within 16 GB with MXFP4) | Apache 2.0 plus gpt-oss usage policy ("you agree to comply with all applicable law") **[Verified]** https://huggingface.co/openai/gpt-oss-20b, https://github.com/openai/gpt-oss/blob/main/USAGE_POLICY | Groq supports **strict** `json_schema` (constrained decoding) for `openai/gpt-oss-20b` **[Verified]** https://console.groq.com/docs/structured-outputs | **Primary.** Fast hosted inference of open weights; can be self-hosted later |
| **Qwen3-4B / Qwen3-8B** | Apache 2.0 **[Verified]** https://huggingface.co/Qwen/Qwen3-8B | Ollama JSON-schema `format` (constrained) **[Verified]** | **Local/offline path** on a CPU laptop (4B) |
| Qwen2.5-3B-Instruct | Hugging Face lists `license: other` (Qwen research licence, not Apache 2.0) **[Verified tag]** https://huggingface.co/Qwen/Qwen2.5-3B-Instruct | Ollama format | Competitor's choice; 78% first-pass in their report. Not chosen because of the licence |

Groq constraints that shape our contract **[Verified]**: in strict mode all properties must be `required`, objects need `additionalProperties: false`, optional values use a `null` union; only a subset of JSON Schema is supported (primitives, objects, arrays, enums, anyOf); streaming and tool use are not supported together with structured outputs. Developer plan base limits for `openai/gpt-oss-20b`: 30 requests per minute, 1K per day, 8K tokens per minute, 200K tokens per day **[Verified]** https://console.groq.com/docs/rate-limits. Free-tier limits were not shown on the page; our eval runner paces requests and caches results.

Qwen3 notes **[Verified]**: thinking mode is on by default and can be disabled (`enable_thinking=False`); native context 32,768 tokens; non-thinking sampling recommendation temperature 0.7, top-p 0.8.

### 5.2 Constrained decoding and JSON-schema output

- Ollama accepts a JSON schema in the `format` field of `/api/chat`; docs recommend also putting the schema in the prompt and using temperature 0 **[Verified]** https://docs.ollama.com/capabilities/structured-outputs
- Constrained decoding guarantees syntax, not truth. Community reports note models can still invent fields or values under loose JSON mode **[Secondary]**. Hence our layered validation: schema, citations, quotes, evidence anchoring, re-simulation.

### 5.3 Retrieval for policy documents

- The policy corpus is small (about 45 clauses across three documents) but structured: clauses have jurisdiction, effective dates, employee class applicability, and precedence (site addendum overrides handbook where more protective).
- **Approach chosen:** hard metadata filters first (jurisdiction, effective date, employee class), then hybrid ranking (BM25 keyword plus dense embedding similarity with reciprocal rank fusion), seeded by the rule-to-clause map for the required clause. Dense model: `BAAI/bge-small-en-v1.5` (MIT, 384 dimensions) through fastembed (Apache 2.0) on CPU **[Verified licences]**.
- We will **measure** retrieval (recall@5, MRR) against gold clause labels and compare BM25-only, dense-only, and hybrid, then report real numbers in `EVALUATION.md`.

### 5.4 LLM evaluation methods

- Labelled synthetic cases with planted exceptions give exact ground truth for detection, retrieval, and correction checks.
- Deterministic fault injection (a scripted model that returns malformed JSON, fake citations, out-of-bounds times, injected instructions) proves each guardrail fires.
- A harness ablation (validation off vs on) measures how many raw model drafts would have been unsafe without the harness.
- Verbalised LLM confidence is frequently miscalibrated and overconfident **[Secondary summaries]**: https://arxiv.org/abs/2306.13063, https://arxiv.org/pdf/2509.25532. We therefore compute confidence from evidence features and report the model's self-reported value only as a secondary signal.

### 5.5 Guardrails, fallback, and prompt injection

- OWASP LLM01 (prompt injection) covers direct and indirect injection. Secondary summaries note that filters alone are bypassable and no complete defence exists **[Secondary]** https://www.confident-ai.com/blog/owasp-top-10-2025-for-llm-applications-risks-and-mitigation-techniques. Mitigations we apply: least privilege (the model has no tools and cannot write), strict output contract, segregating and labelling untrusted text, deterministic validation of every output, and human approval for every change.
- Employee comments and attestation notes are the primary injection surface in this product. We plant injection attempts in the evaluation set.

---

## 6. UI/UX research

Patterns studied (from vendor documentation above and widely used review tools).

| Source | Strength | Weakness | Opportunity for Countersign |
|---|---|---|---|
| UKG timecard grid | Exceptions in context of the timecard; right-click actions | Dense grid; meaning carried by colour; no "why" | Pair the grid with a visual shift ribbon and plain-language reason |
| Dayforce "Problems" list | One place to find punch errors | List without prioritisation or impact | Rank by risk: severity x pay impact x time to cutoff |
| Deputy approval with variance | Clear scheduled vs actual comparison | Auto-approval is a blunt threshold | Guarded bulk approval that requires all harness gates and strong evidence |
| Code review tools (diff, required checks) | Before/after diff; required status checks block merge | Developer-oriented | Before/after timecard diff and a visible "gate strip" that must be green before approval |
| Keyboard-first triage tools (inbox style) | J/K navigation, single-key actions, command palette | Learning curve | Shortcuts plus visible hints; mouse remains first-class |
| UKG AI transparency cards | States what the agent can and cannot do | Static page | Inline "What the model did / did not do" panel per suggestion |

---

## 7. Differentiation: how Countersign will outperform typical submissions

| Category | Typical submission | Countersign |
|---|---|---|
| **Product value (25%)** | Lists exceptions and asks an LLM to suggest a fix | **Root-cause cascades** ("approve 1 correction, clears 4 exceptions"), **evidence-anchored punch times** from badge and scanner signals, **pay impact preview** per decision, **overtime forecast with compliant shift swaps** before overtime happens, **employee attestation** loop, cutoff-aware risk queue, and measured outcomes (time to decision, exceptions cleared before cutoff, overtime cost flagged) |
| **Harness engineering (25%)** | Schema check plus "citation in list" | Ten named gates including **verbatim quote grounding**, **numeric fact checking** of explanations, **evidence anchoring** of every timestamp, **counterfactual re-simulation** for target and side effects, business guardrails (never reduce paid hours, never edit breaks without attestation, never deny worked overtime), one guided repair attempt, visible fallback and escalation, **harness-computed confidence**, re-validation of manager edits, hash-chained audit with verification, live **fault injection** from the UI |
| **LLM implementation (20%)** | Rule ID equals policy ID; single prompt | Separate clause IDs across three policy documents with precedence and effective dates, **hybrid retrieval with metadata filters** and measured recall@5 and MRR (BM25 vs dense vs hybrid), versioned prompts with untrusted-text segregation, strict JSON-schema decoding on gpt-oss-20b, a local Qwen3 path, and a **harness ablation** that quantifies model failure modes |
| **Engineering quality (15%)** | Some unit tests | OpenAPI contract with drift check, generated frontend types, Pydantic and Zod at both boundaries, unit, integration, Schemathesis contract, Vitest, Playwright, evaluation in CI with thresholds, trace spans per pipeline stage, structured logs, Docker Compose with health checks |
| **Demo (15%)** | Click-through of happy path | A scripted ten-minute story with a ticking payroll cutoff, a cascade fix, a blocked injection attempt, a live fault showing visible fallback, the harness inspector trace, and real evaluation numbers from this repository |
