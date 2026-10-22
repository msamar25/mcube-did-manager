# MCube DID Manager v7 — single-process FIFO queue

## Deployment
Use a single Render web service with exactly **one instance and one Uvicorn worker**. Deployments must not overlap while MCube operations are running. Keep all v6 Brevo, Google Sheets and MCube environment variables. PostgreSQL/Redis are not required.

## Behavior
- Each accepted replacement is appended to Google Sheets `Operation_Queue` before the API acknowledges acceptance.
- The background worker processes queued batches in append order, one at a time.
- Live MCube active/pool inventory is revalidated before each replacement.
- Queue events: `QUEUED`, `STARTED`, `COMPLETED`, `NEEDS_RECONCILIATION`.
- A restarted process never automatically retries an operation marked `STARTED`. An administrator must verify MCube, resolve the related batch, and acknowledge recovery. A queue record stuck at `STARTED` without a batch log requires manual repair; do not bypass the gate.
- Google Sheets is **not** a distributed lock. This design is for one process only, and cannot prevent overlapping deployments or external MCube scripts from changing DIDs.

## Performance
- Browser no longer triggers call sync and reminders automatically on every login.
- DID table renders paginated rows (50 per page); no full table DOM rendering.
- Queue status polling is 3 seconds per active operator, instead of polling the full DID inventory.
- Sheets remains the performance bottleneck for very large queue/audit histories. Consider periodic archival.

## Mandatory tests before production
1. Two operators submit the same DID simultaneously: only one accepted.
2. Different DIDs submitted in order: worker executes sequentially.
3. Force timeout after MCube deactivation: no automatic retry, manual reconciliation.
4. Restart during `STARTED`: block rather than retry.
5. Disconnect Google Sheets: fail closed.
6. Verify Render only runs one worker and no overlapping instance during deployments.

## Limitations
Not production-verified against real Brevo, Google Sheets or MCube. The in-memory queue wakeup is not persistent; the queue itself is persisted in Sheets and periodically rescanned. Google Sheets appends are not transactional across independent processes. Exactly-once MCube side effects cannot be guaranteed without MCube idempotency support.
