# Data Sources

All data in Countersign is **synthetic** or **fictional**. No real employee, company, or customer data is used.

| Dataset | Origin | How it is produced | Licence | Labelled in UI as |
|---|---|---|---|---|
| Company, sites, employees | Fictional "Kestrel Logistics" | `backend/app/seed/generator.py` with fixed seed; names from a hand-written list of common first and last names combined at random, not real people | Project licence | "Synthetic data" |
| Schedules and punches | Synthetic | Generated with bounded jitter (IN 0 to 4 minutes late, OUT 0 to 4 minutes early, so ordinary shifts never cross the 8-hour daily threshold by accident) plus planted scenarios | Project licence | "Synthetic data" |
| Badge and scanner events | Simulated feeds | Generated to corroborate or contradict punches according to scenario | Project licence | "Simulated feed" |
| Policy pack v2026.2 | Fictional, written by the team | Handbook, California addendum, Bengaluru addendum. Thresholds inspired by public rules listed in RESEARCH.md section 2 | Project licence | "Fictional policy, not legal advice" |
| Holiday calendar | Fictional company calendar | Includes Deepavali (Sun 8 Nov 2026) for the Bengaluru site | Project licence | "Company calendar (fictional)" |
| Evaluation dataset | Synthetic, hand-labelled | `backend/eval/dataset.py`, seed 777 (the demo uses 20261106) | Project licence | n/a |

## Demo scenarios (planted)

| Scenario | Employee (synthetic) | Exercises |
|---|---|---|
| Two missed punches join Tue and Wed (badge exit 15:29, badge entry 07:02) | Diego Alvarez, Fremont | R-PUNCH-SPAN with 2 symptoms (daily overtime, late second meal) |
| Thursday missing OUT, badge exit 15:31, confirmation requested | Diego Alvarez, Fremont | R-PUNCH-MISSING-OUT, employee attestation |
| Missing OUT with a prompt-injection note | Kai Morgan, Fremont | Sanitiser flags, G10 |
| Missed meal on a 6.5 h shift; projected 46.3 h with a Saturday shift | Priya Natarajan, Fremont | R-MEAL-MISSED premium; F-OT-RISK swap to Marcus Taylor |
| Badge exit 15:10 vs scanner activity until 17:20 | Sam Okafor, Fremont | Conflicting evidence, escalation |
| Meal start without meal end, employee confirmed 11:33 | Hannah Brooks, Fremont | R-BREAK-UNPAIRED with 2 symptoms |
| Night shift ran long; Sunday shift projects overtime with no eligible colleague | Victor Mensah, Fremont | R-OT-DAILY; F-OT-RISK falls back to pre-approving overtime |
| Late meal, short meal, clopening, unscheduled cover, duplicate IN, tardies, early departure | Fremont employees | Meal, rest, and schedule rules; bulk approval |
| Seven consecutive days, weekly overtime, missing IN, missed meal | Austin employees | Handbook rules (no daily overtime in Texas) |
| Deepavali shifts, 10.5 h day, continuous work over 5 h, 10 h rest, projected 50.4 h | Bengaluru employees | Bengaluru addendum rules; swap to Karthik Reddy |
| Exempt shift lead working 10 h | Ethan Clarke, Fremont | Must not raise overtime or meal exceptions |

The daylight-saving change (Sunday 1 November 2026) and overnight pairing are covered by engine unit tests and the evaluation set rather than the demo data.

## Public references (not data)

Regulatory pages and vendor documentation cited in RESEARCH.md are references only. No content from them is loaded into the product, except that policy wording was written independently by the team.
