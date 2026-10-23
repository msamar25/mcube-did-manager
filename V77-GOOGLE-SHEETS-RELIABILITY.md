# v77 — Google Sheets-only recovery foundation

No PostgreSQL, Redis or additional paid infrastructure required.

## Implemented
- `Request_Mutations` is an append-only ticket-intent journal. It is written **before** the mutable `Pending_Requests` summary. Every update includes a UUID, IST timestamp, request ID, and full ticket snapshot JSON.
- `recover_requests()` reconstructs missing or out-of-date ticket rows using the latest journal entry for each request ID, preserving legacy rows without a journal entry.
- Recovery is run under the existing single-process operation lock before public submissions, manual call sync and ticket review.
- Admin recovery API: `POST /api/admin/recover-requests` (authenticated administrator only).
- Invalid journal JSON stops recovery for manual review rather than silently discarding history.
- Added tests for interrupted snapshot writes, repeat recovery, latest-intent replay, and corrupted journal.
- Corrected an existing test that expected UTC although the application explicitly uses IST.

## Deployment
1. Back up the Google Sheets workbook before deployment.
2. Keep **exactly one** Render web-service instance and one Uvicorn worker. Do not run concurrent scheduled sync jobs in separate instances.
3. Grant the Google service account edit access. The application automatically creates `Request_Mutations` on first ticket update.
4. Test a new form submission, call sync, review, ticket timeline and admin recovery in staging.
5. If a write fails, run the admin recovery endpoint after Google Sheets access is restored; do not manually delete journal rows.

## Limitations — not yet fully solved
- A journal append may succeed while the HTTP request fails. Retrying a public submission with a new submission ID can create another event; request-level idempotency across retries requires a stable client-generated submission key.
- The journal is not a cross-process lock and does not guarantee atomic updates across sheets. A single worker is still mandatory.
- Existing MCube operation queue and audit logging remain separate; reconciliation after uncertain MCube responses still requires operator verification.
- Google Sheets reads and full summary rewrites still incur API costs; this release is a recovery foundation, not a complete event-sourced migration.
- In-memory rate limits do not survive restarts. Cloudflare Turnstile remains required for public submissions.
- Live Google Sheets, MCube, Turnstile, and browser integration tests were not run.
