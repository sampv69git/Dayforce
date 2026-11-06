# Model Card: Countersign Drafting Component

Status: pre-implementation. Performance sections will be filled only with results from real runs (see `EVALUATION.md`).

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

- **Input:** system prompt `draft.v1`; user message with JSON case context (employee code, site jurisdiction, exempt flag, work date, rule ID, evidence items with IDs, facts, allowed ops, plausible window, retrieved clauses with IDs and text) and an `<untrusted_employee_text>` block. No names, no rates beyond what the facts need.
- **Output:** JSON conforming to `DraftResolution` (HARNESS.md section 1.3).
- **Parameters:** temperature 0; gpt-oss reasoning effort low; max output 900 tokens; timeout 20 s; one repair retry.

## 6. Known limitations and risks

- Constrained decoding guarantees format, not correctness. Models can still cite the wrong clause, paraphrase quotes, choose an unsupported time, or misstate numbers. Gates G3 to G10 exist for these cases.
- Small local models (4B) are expected to fail grounding gates more often; failures route to visible fallbacks.
- Prompt injection through employee text cannot be fully prevented by any model; the harness limits impact (no tools, strict output, validation, human approval).
- Verbalised confidence is unreliable; Countersign does not use it for routing.

## 7. Evaluation

Methods and results: `EVALUATION.md`. Metrics: schema-valid first pass, citation accuracy, quote grounding, re-check pass, correction accuracy against gold, fallback and escalation rates, injection resistance, latency. No numbers are reported here until a real run exists.

## 8. Ethical considerations

- Corrections affect pay. Guardrails prevent the model from reducing paid hours, denying worked overtime, or editing breaks to hide meal violations.
- Employees are informed and can attest; their notes are treated as data, not instructions.
- Every draft and decision is auditable.
