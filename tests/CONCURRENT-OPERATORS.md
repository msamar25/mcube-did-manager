# Concurrent operators — v5

## Required configuration

Set `DATABASE_URL` to a reachable PostgreSQL connection string in Render (TLS as required by your provider). **Do not use a pooler in transaction mode**: PostgreSQL session advisory locks require a stable connection. Do not use Render Free local files or Google Sheets as a lock service. If PostgreSQL is missing or unreachable, every protected mutation fails closed (503).

Set `OPERATOR_USERS_JSON` to an array of separately issued accounts, for example:

```json
[
  {"email":"operator1@example.org","pin_hash":"pbkdf2_sha256$..."},
  {"email":"operator2@example.org","pin_hash":"pbkdf2_sha256$..."}
]
```

Use `python generate_pin_hash.py` separately for each operator. Existing `OPERATOR_EMAIL` and `OPERATOR_PIN_HASH` still work for backward compatibility. OTP emails go to each operator's own email. Do not put real PINs in `OPERATOR_USERS_JSON`.

## Concurrency guarantees

- A single PostgreSQL advisory lock serializes **all protected state mutations** across operators, worker processes and Render instances pointing at the same database.
- The lock is acquired **before** reading/validating a replacement request or checking direct DID eligibility. A second operator receives HTTP 409 and should refresh, rather than queue a competing batch.
- The lock stays owned by the background batch through MCube deactivation, activation, live verification, Sheets updates, and notifications. No handoff gap.
- Replacements are sequential; active agent/DID ownership and pool membership are fetched again before each MCube change.
- After an uncertain MCube outcome, remaining operations stop and affected pending requests are marked `needs_reconciliation`.
- If PostgreSQL loses its connection during an operation, its advisory lock may be released. This is a limitation of session locks; stop processing and reconcile before any retry. The app must not be treated as fully crash-proof without durable transactional job state and fencing.

## Release gate

Test two operators submitting the same request simultaneously, different requests simultaneously, operator vs scheduled sync, worker restart during replacement, PostgreSQL disconnection, and MCube timeout after deactivation. Do not enable unattended production replacements until all are verified.
