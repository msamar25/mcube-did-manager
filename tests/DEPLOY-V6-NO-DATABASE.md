# MCube DID Manager v6 — single-instance deployment without PostgreSQL

## What changed
- Removed `DATABASE_URL` and psycopg.
- Single-process nonblocking mutex serializes concurrent operator replacements, syncs, maintenance, settings and queue writes where protected by existing endpoints.
- Every DID-changing batch is recorded in Google Sheets `Change_Logs` before MCube is called.
- A restart or failed batch leaves a journal entry open. New replacements fail closed until administrator reconciliation.
- `GET /api/recovery` shows unresolved batches. `POST /api/recovery/acknowledge` requires an admin session, batch_id, a descriptive note (12+ characters), and confirmation string `I_VERIFIED_MCUBE_AND_RESOLVED_THE_BATCH`.
- Scheduler secret `MCUBE_MAINTENANCE_TOKEN` in GitHub Actions must match Render `MAINTENANCE_TOKEN`.

## Mandatory operational constraints
1. Run **one Render service instance** and **one Uvicorn worker**. Never enable horizontal scaling or `--workers 2+` with this design.
2. Do not run a second MCube-changing script, Render service or deployment concurrently.
3. Use Google Sheets for durable journaling only; Sheets is **not** a distributed atomic lock.
4. On a failed or interrupted batch, check live MCube active/pool inventory, compare the affected DIDs and agent numbers, correct request statuses, and only then acknowledge the unresolved batch. Acknowledgement itself does not repair an MCube assignment.
5. The lock is process-local. Rolling deploys may briefly overlap processes. Stop DID changes during deploys; deploy outside operating hours.
6. Batch order is the submitted request order; strict oldest-request-first scheduling is NOT guaranteed by this release.
7. The email OTP challenge cache is also process-local; restarting invalidates outstanding OTPs.
8. Never store Brevo, MCube or Google credentials in GitHub. Use Render secret environment variables.

## Environment
Use `render.yaml` and `DEPLOY-BREVO-OTP.md`. No PostgreSQL or `DATABASE_URL` required.
Configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PIN_HASH`, `OPERATOR_USERS_JSON`, `SESSION_SECRET`, `MAINTENANCE_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `MCUBE_BEARER_TOKEN`, `MCUBE_CONFIG_TOKEN`.

## UAT
- Two browser sessions: submit same DID concurrently; one should get HTTP 409.
- Two different DID replacements: second should get HTTP 409 until the first finishes.
- Kill/restart process mid-batch in a staging environment. Verify new replacements are blocked by `/api/recovery` until manual reconciliation.
- Verify Google Sheets `Change_Logs`, pending request statuses and live MCube inventory after each test.
- Confirm GitHub Actions maintenance secret uses `MAINTENANCE_TOKEN`.

This code has not been live-tested against your Brevo, Google Sheets or MCube account. It is for controlled UAT, not unattended production operation.
