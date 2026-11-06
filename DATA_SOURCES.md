# Data Sources

All data in Countersign is **synthetic** or **fictional**. No real employee, company, or customer data is used.

| Dataset | Origin | How it is produced | Licence | Labelled in UI as |
|---|---|---|---|---|
| Company, sites, employees | Fictional "Kestrel Logistics" | `backend/app/seed/generator.py` with fixed seed; names from a hand-written list of common first and last names combined at random, not real people | Project licence | "Synthetic data" |
| Schedules and punches | Synthetic | Generated with realistic jitter (normal distribution around scheduled times) plus planted scenarios | Project licence | "Synthetic data" |
| Badge and scanner events | Simulated feeds | Generated to corroborate or contradict punches according to scenario | Project licence | "Simulated feed" |
| Policy pack v2026.2 | Fictional, written by the team | Handbook, California addendum, Bengaluru addendum. Thresholds inspired by public rules listed in RESEARCH.md section 2 | Project licence | "Fictional policy, not legal advice" |
| Holiday calendar | Fictional company calendar | Includes Deepavali (Sun 8 Nov 2026) for the Bengaluru site | Project licence | "Company calendar (fictional)" |
| Evaluation dataset | Synthetic | `eval/generate.py`, different seed from the demo data | Project licence | n/a |

## Demo scenarios (planted)

| Scenario | Employee (synthetic) | Exercises |
|---|---|---|
| Two missed punches join two shifts | Diego Alvarez, Fremont | R-PUNCH-SPAN, cascade of 4 symptoms |
| Missing OUT with injection attempt in note | Diego Alvarez, Fremont | R-PUNCH-MISSING-OUT, sanitiser, G10 |
| Missed meal on a 6.5 h shift | Priya Natarajan, Fremont | R-MEAL-MISSED, premium, guardrail against break edits |
| Projected overtime | Priya Natarajan, Fremont | F-OT-RISK, swap to Marcus Taylor |
| Conflicting evidence | Sam Okafor, Fremont | Escalation |
| Overnight shift across DST change | Fremont night shift | Pairing and hours |
| Floater from Austin working in Fremont | Austin employee | Time zone and jurisdiction |
| Holiday shift | Bengaluru employee | R-HOLIDAY-WORK |
| Duplicates and tardies | Various | Bulk approval |

## Public references (not data)

Regulatory pages and vendor documentation cited in RESEARCH.md are references only. No content from them is loaded into the product, except that policy wording was written independently by the team.
