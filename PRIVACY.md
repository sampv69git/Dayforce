# Privacy

## Summary

Countersign is a prototype that processes **only synthetic data**. It must not be used with real personal data.

## Data minimisation

- Employee names are never sent to an LLM provider. Case context uses employee codes (for example `E-FRE-007`), site jurisdiction, exempt flag, and the facts needed for the specific exception.
- Hourly rates are not sent to the model; pay is computed by code.
- Employee notes are sent only when relevant to the exception, length-capped at 500 characters, inside an untrusted block.

## Third-party processing

- **Groq** (hosted inference for gpt-oss-20b) receives case context for each draft. With synthetic data, no personal data leaves the machine. In a real deployment, a data processing agreement and a self-hosted model (vLLM or Ollama) would be required.
- **Ollama** runs locally; nothing leaves the machine.
- Embeddings are computed locally with fastembed.

## Storage and retention

- The database stores synthetic records, pipeline runs (including prompts and raw outputs, for audit), decisions, and audit events.
- `make reset` deletes and reseeds all data.
- No analytics or tracking scripts in the web app.

## Rights and transparency (design intent for a real deployment)

- Employees can see their own timecard, exceptions that affect them, and corrections made, with the manager's reason.
- Every correction is attributable to a named decision maker.

## Labels

The UI shows "Synthetic data" in the top bar at all times and "Simulated feed" on badge and scanner evidence.
