# v8 — Google Sheets quota optimization

Deploy as in DEPLOY-V7.md. No new external service or mandatory environment variables.

Optional `SHEETS_SNAPSHOT_TTL_SECONDS=10` (0–30 seconds). This caches only the read-only `/api/dids` inventory view. An explicit MCube sync invalidates it immediately. Do not rely on this display cache for operational decisions; replacement and duplicate checks read fresh Sheets data.

Changes:
- Google Sheets client, spreadsheet and worksheet handles reused per Python worker thread.
- `/api/dids` uses a 10-second in-process cache, invalidated by snapshot updates.
- `/api/queue` uses a maximum 3-second display-only cache, invalidated on queue events.
- Quota-aware exponential retry for read/metadata calls (HTTP 429/5xx), with jitter.
- Writes are NOT automatically retried because an uncertain append could duplicate a queued operation.
- Synchronous Sheets inventory reads run in a worker thread, avoiding event-loop blocking.

Limits: This is not a global request quota governor; several simultaneous cache misses can still cause extra requests. Google Sheets is not a transactional database. Exactly one Render instance and one Uvicorn worker remain mandatory. No live Brevo/Sheets/MCube integration test has been performed. Test in UAT before changing production DIDs.
