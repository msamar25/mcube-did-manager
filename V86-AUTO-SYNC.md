# v86: automatic sync follows the Settings page + Google Sheet health check

## What changed in the backend (`backend/main.py` only)

The cron endpoints used hard-coded intervals (calls 5 min, inventory 15 min, employees 60 min) and ignored
the intervals saved in Settings. They now read `App_Settings` on every run:

| Job | Setting used | Minimum (protects MCube / Sheets quotas) | Fallback if missing |
|---|---|---|---|
| `inventory`: MCube active / inactive / pool lists → Active_DIDs, Inactive_DIDs, DID_Pool_FIFO | `auto_inventory_minutes` | 5 min | 15 min |
| `calls`: MCube calls → replacement requests | `auto_calls_minutes` | 2 min | 5 min |
| `employees`: Employee_Directory | `auto_employee_minutes` | 30 min | 60 min |
| `recovery`: request ledger recovery | fixed | 15 min | 15 min |
| `history` (new job): Change_Logs → Agent_Replacement_History | fixed | 60 min | 60 min |

**New endpoint: `POST /api/jobs/sync/auto`.** It needs the same `X-Cron-Secret` header as the existing jobs.
- One call runs the single most overdue job in the background and answers immediately (`202 accepted`).
- If nothing is due it returns `idle`; outside 08:30–23:10 IST it returns `outside_business_hours`; if a sync or replacement is already running it returns `busy`.
- It reuses the existing job runner and the existing operation lock, so a sync can never overlap a DID replacement.

**Unchanged:** authentication, roles, MCube deactivate/activate, FIFO selection, verification, the operation lock,
Google Sheets layouts, audit logs, `/api/maintenance/tick`, `/api/jobs/sync` and `/api/jobs/sync/{job}` (they now use the Settings intervals too).

Tests: `tests/test_auto_sync_v86.py` (10 new), and the 9 existing tests still pass, all run against the real `backend/`:

```bash
python -m pytest -q --import-mode=importlib tests/test_auto_sync_v86.py tests/test_request_recovery.py tests/test_matching.py tests/test_ist_v17.py tests/test_single_process_lock.py
```

> **Note:** `tests/backend/` is an old copy of the backend. With pytest's default import mode, the tests import
> that copy instead of `backend/`, so always run them with `--import-mode=importlib`. Better still, delete `tests/backend/`.

## Why nothing has synced since 23 Oct

- `Sync_Jobs` has one run only (23 Oct, 09:22 UTC).
- `Workflow_Sync` has no `inventory_auto_sync` entry.
- `Agent_Replacement_History` is empty.

So no external scheduler is calling the backend. Render Free sleeps when idle, so a scheduler outside Render is required.

## Set up automatic sync (free, about 5 minutes)

1. In Render, open the service → **Environment**. Make sure `CRON_SYNC_SECRET` exists: a long random value, never shared or put in the frontend.
2. Go to https://cron-job.org and create a free account. Then **Create cronjob**:
   - URL: `https://<your-service>.onrender.com/api/jobs/sync/auto`
   - Schedule: **every 2 minutes**. Time zone **Asia/Kolkata**, 08:30–23:10 (the backend also ignores calls outside this window).
   - Advanced → Request method **POST**, header `X-Cron-Secret: <the CRON_SYNC_SECRET value>`
   - Treat `202`, and `200` with `idle`, `busy` or `outside_business_hours`, as success.
3. Disable any older cron-job.org jobs that call `/api/jobs/sync` or `/api/jobs/sync/{job}`, so jobs aren't duplicated.
4. Change intervals on the **Settings** page (Inventory / Calls / Employee refresh). The next cron call picks them up.

With every-2-minute calls and the default Settings values (inventory 5, calls 5, employees 1440), each job runs
close to its configured interval: one job per call, the most overdue first. The very first call after Render wakes up may take
about 50 s (cold start); the next call will catch up.

## Google Sheet check (read-only, 26 Oct; every tab was read)

| Finding | Impact | Fix |
|---|---|---|
| `Pending_Requests` B2:B5 show `callid` as `7.01955E+19` / `9.38168E+19`. Google Sheets turned the 20-digit ID into a rounded number | The original call ID is lost in those 4 old rows. Newer rows are stored as text, so the code is already correct | Manual repair below |
| No sync since 23 Oct | Inventory and requests are stale | Scheduler setup above |
| `Agent_Replacement_History` empty although 2 replacements completed | Agent 360° history is empty | The new `history` job fills it automatically |
| Active_DIDs: DID `8071844409` appears twice; 10 DIDs duplicated in Inactive_DIDs; 3 DIDs in both Active and Inactive | These come from MCube's own lists and are rewritten on every sync | Check them in MCube. The Risk Radar flags them |
| 155 Active_DIDs rows are `common pool` (no agent) | Correctly excluded from "assigned" and utilization | None |
| `Sheet1` is an empty extra tab | None | Optional: delete it |

### Repair the 4 call IDs (Pending_Requests, column B)

1. Select column **B** → **Format → Number → Plain text**. Without this step, Sheets will convert the IDs again.
2. Type the original call IDs. They were sent separately (`sheet-repair-values.md`), because each call ID begins with the agent's phone number and shouldn't be stored in the repository. Each value was matched to the request's first call by its exact start time in `Call_Request_Events`.

Don't change any other cell or column, and don't sort or reorder rows: the backend relies on row order in append-only tabs.
