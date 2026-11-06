# Model Card: Countersign Drafting Component

Status: implemented. Performance below comes from committed evaluation reports (see `EVALUATION.md`).

## 1. What the model does

Given a verified case context (one timecard exception, its evidence, the constraints envelope, and the top retrieved policy clauses), the model writes a `DraftResolution`: a short summary, a plain-language explanation, a list of proposed operations chosen from an allowed set, citations with verbatim quotes, an assessment of any employee note, and an escalation flag.

The model does **not** detect exceptions, compute hours or pay, decide anything, or write to any system. A deterministic harness validates every draft and a human approves, edits, or rejects it.

## 2. Models

| Role | Model | Weights licence | Acceptable use | Serving |
|---|---|---|---|---|
| Primary | `openai/gpt-oss-20b` (21B total, 3.6B active, MoE) | Apache 2.0 | gpt-oss usage policy: comply with all applicable law (https://github.com/openai/gpt-oss/blob/main/USAGE_POLICY) | Groq API, strict `json_schema` decoding |
| Local / offline | `qwen3:4b` (Qwen3-4B) | Apache 2.0 | Apache 2.0 terms; Qwen3 model card | Ollama on CPU, schema-constrained `format`, thinking disabled |
| Degraded | Rule-based templates | n/a | n/a | In-process |
| Tests and fault injection | Scripted provider | n/a | n/a | In-process |
| Embeddings | `BAAI/bge-small-en-v1.5` (384-d) | MIT | MIT terms | fastembed (ONNX, CPU) |

Licences verified on 2026-11-06 from the Hugging Face model pages and the gpt-oss repository. Groq is an inference provider; the weights remain open and self-hostable.

## 3. Intended use

- Drafting explanations and corrections for synthetic timecard exceptions in a prototype, for review by a manager.
- Users: line managers and payroll administrators of a fictional company.

## 4. Out of scope and prohibited use

- Making final pay or employment decisions.
- Processing real employee data.
- Providing legal advice or claiming legal compliance.
- Any use without the harness and human approval.

## 5. Inputs and outputs

- **Input:** system prompt `draft.v2`; user message with JSON case context (employee code, site jurisdiction, exempt flag, work date, rule ID, evidence items with IDs, facts, allowed ops, plausible window, retrieved clauses with IDs and text) and an `<untrusted_employee_text>` block. No names, no rates beyond what the facts need.
- **Output:** JSON conforming to `DraftResolution` (HARNESS.md section 1.3).
- **Parameters:** temperature 0; gpt-oss reasoning effort low; max 2,048 completion tokens; timeout 30 s with up to 4 retries on rate limits; one repair retry.

## 6. Known limitations and risks

- Constrained decoding guarantees format, not correctness. Models can still cite the wrong clause, paraphrase quotes, choose an unsupported time, or misstate numbers. Gates G3 to G10 exist for these cases.
- Small local models (4B) are expected to fail grounding gates more often; failures route to visible fallbacks.
- Prompt injection through employee text cannot be fully prevented by any model; the harness limits impact (no tools, strict output, validation, human approval).
- Verbalised confidence is unreliable; Countersign does not use it for routing.

## 7. Evaluation

Methods and full results: `EVALUATION.md`. gpt-oss-20b on Groq, prompt `draft.v2`, 30 stratified cases (recorded as commit 4dcf6b7, published as f88a2ab with identical code):

| Metric | Result |
|---|---|
| Schema-valid first pass | 0.833 |
| Quote grounding / re-check pass | 1.000 / 1.000 |
| Verified suggestion rate (incl. repaired) | 0.833 |
| Correction accuracy | 0.967 |
| Unsafe drafts reaching a manager | 0 |
| Raw unsafe rate without the harness | 0.233 |
| Latency p50 / p95 | 1.7 s / 17.0 s (p95 includes rate-limit backoff) |

Every model error observed was a format error (strict-decoding failures at the provider, too many or too few operations, escalation combined with other operations); none was a grounding error. qwen3:4b has not been evaluated in this environment.

## 8. Ethical considerations

- Corrections affect pay. Guardrails prevent the model from reducing paid hours, denying worked overtime, or editing breaks to hide meal violations.
- Employees are informed and can attest; their notes are treated as data, not instructions.
- Every draft and decision is auditable.
