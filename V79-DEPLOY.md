# v79 — Split scheduled synchronization (cron-job.org 30-second plan)

## Deploy
1. Commit this project to `main`. Existing Render backend Web Service deploys it. Retain all environment variables, including `CRON_SYNC_SECRET` and `STATIC_FRONTEND_ORIGINS`.
2. Existing Render Static Site deploys from the same branch using `bash build-static.sh` and `frontend/dist`; `BACKEND_PUBLIC_URL` remains the backend HTTPS URL.
3. Disable the old combined cron `POST /api/jobs/sync`. It remains for backward compatibility but can exceed 30 seconds.
4. Create separate cron-job.org **POST** jobs with header `X-Cron-Secret: <CRON_SYNC_SECRET>`:
   - `https://mcube-did-manager.onrender.com/api/jobs/sync/calls` — every 5 min
   - `https://mcube-did-manager.onrender.com/api/jobs/sync/inventory` — every 15 min
   - `https://mcube-did-manager.onrender.com/api/jobs/sync/employees` — hourly
   - `https://mcube-did-manager.onrender.com/api/jobs/sync/recovery` — every 15 min
5. Schedule each job only 08:30–23:10 Asia/Kolkata. Stagger their start minutes to avoid overlapping: e.g. calls at minutes 0,5,...; inventory at 2,17,32,47; recovery at 3,18,33,48; employees at minute 4. Avoid scheduling all jobs at the same minute.
6. For initial testing, execute only one job manually, then inspect Google Sheets `Sync_Jobs` for a later `success` or `failed` row. HTTP 202 means *accepted*, not completed. `busy` means another operation is running, and that job needs a later retry.

## API response examples
- `202 {"status":"accepted","job":"calls",...}` — background task accepted, **not completed**.
- `200 {"status":"busy","job":"calls","retry":true}` — no work started.
- `200 {"status":"outside_business_hours",...}` — no work started.
- `401` — wrong/missing cron secret.

## Reliability and constraints
- Uses the existing in-process operation lock, so only one backend instance and one uvicorn worker are supported. A job may be interrupted if Render restarts or sleeps; the next cron execution can retry after the last successful checkpoint, but this is not a durable queue and cannot guarantee exactly-once execution.
- The `Sync_Jobs` append-only log records `running`, `success`, `failed` or best-effort `interrupted`. A process killed abruptly may leave `running` as its final status.
- Calls rely on existing call-ID deduplication and request journal; MCube DID-changing actions are NOT invoked by these sync endpoints. Recovery does not blindly retry uncertain DID changes.
- Google Sheets or MCube API calls can still take longer than 30 seconds **in the backend**, even though the cron HTTP request responds quickly. A free Render restart can interrupt these tasks.
- The old combined `/api/jobs/sync` remains available for compatibility; disable its cron job to prevent duplicate workloads.
- Health `/api/health` remains read-only. No extra database is introduced.
- For stronger reliability, a persistent job runner / queue external to a sleeping free web process is needed. This version improves cron responsiveness, not execution guarantees.
