# v78 — Business-hours scheduler and static frontend

## Deploy backend
Keep the existing Render **web service** (FastAPI) and its environment variables. Add:
- `STATIC_FRONTEND_ORIGINS=https://YOUR-STATIC-SITE.onrender.com` (comma-separated if multiple)
- `CRON_SYNC_SECRET` — long random secret, used only by external scheduler; never include in frontend.
- `TURNSTILE_EXPECTED_HOSTNAME` — hostname of the new static frontend (no protocol).

Keep backend at one worker. Google Sheets remains the sole data store.

## Deploy static frontend
Create **Render Static Site** from the same repository:
- Build command: `bash build-static.sh`
- Publish directory: `frontend/dist`
- Environment variable: `BACKEND_PUBLIC_URL=https://YOUR-BACKEND.onrender.com`
- Rewrite rule: `/support-request` -> `/support-request/index.html` (rewrite, not redirect). Also SPA fallback `/*` -> `/index.html`, after the form rule.
- Configure Turnstile site key to allow the static hostname. Site key remains public; secret stays backend-only.

New public form URL: `https://YOUR-STATIC-SITE.onrender.com/support-request`.
Old backend `/support-request` still exists for backward compatibility but may show Render's spin-up screen. Do not remove until old links have been updated.

## cron-job.org — Asia/Kolkata
1. Existing health ping: `GET https://YOUR-BACKEND.onrender.com/api/health`, every 10 minutes **08:30–23:10 IST**.
2. New sync job: `POST https://YOUR-BACKEND.onrender.com/api/jobs/sync`, every 5 minutes **08:30–23:10 IST**; header `X-Cron-Secret: <CRON_SYNC_SECRET>`.
3. Disable overnight pings. At 23:10 a final due-job check runs. Jobs are scheduled based on last successful execution and may run shortly after their nominal interval.
4. If cron service uses UTC, convert schedule carefully (IST = UTC+05:30); crossing midnight needs two UTC windows. Verify cron timezone settings.
5. Health endpoint is READ ONLY and does not sync. Scheduler uses the same operation lock as other writes; overlapping runs return `busy`.
6. Sync history is append-only `Sync_Jobs` sheet. Backend `/api/jobs/status` is authenticated. **Do not put cron secret in frontend.**

## Limits
- Backend may still restart on Render Free; static frontend can show branded loading while API wakes.
- Scheduler is not a transactional queue; if Render restarts during a sync, next invocation retries due jobs, relying on existing deduplication.
- Static frontend displays before API, but user interactions need API to become ready. Health 200 alone does not verify Sheets/MCube.
- Static form has same server-side identity and Turnstile validation as v77. CORS is restricted to configured origins.
- Existing admin authentication, MCube and Google Sheets integrations are retained.
