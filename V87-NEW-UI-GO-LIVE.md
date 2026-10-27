# v87 — New SupportHub UI on live data (DID features)

The new UI (`frontend-next/`) now uses the existing FastAPI backend for every DID feature. No backend business
logic was changed for this: FIFO selection, recent-replacement review, the operation lock, the fresh MCube check
before every agent, verification and the Change_Logs journal all stay in the backend. The UI only shows their results.

## What is live

| Area | Backend endpoints used |
|---|---|
| Sign-in: email + PIN → emailed one-time code → 8-hour session; roles admin / operator | `/api/auth/start`, `/api/auth/verify`, `/api/auth/logout`, `/api/me` |
| DID Inventory, Operators, Pool, 3D Command Center, Dashboard | `/api/dids`, `/api/inventory/status`, `/api/logs`, `/api/jobs/status` |
| "Refresh from MCube" | `POST /api/sync` |
| Replacement Queue → **Start replacement** (live progress) | `POST /api/requests/reassign`, `/api/queue`, `/api/batch` |
| Replace from DID Inventory / Agent 360° | `POST /api/reassign` (same recent-replacement check as today) |
| Support Requests, ticket timeline, approve / reject review, Sync calls, Run reminders | `/api/requests`, `/api/requests/{id}/timeline`, `/api/requests/{id}/review`, `/api/requests/sync`, `/api/reminders/run` |
| Agent 360°, DID Passport, Risk Radar | `/api/agents/{n}/profile`, `/api/dids/{did}/passport`, request and inventory data |
| Analytics, Teams, Reports | `/api/insights`, `/api/logs` |
| Settings (incl. the automatic sync intervals), settings history, MCube credentials, employee sync, clear snapshots | `/api/settings`, `/api/settings/history`, `/api/mcube-config/credentials*`, `/api/employees/sync`, `/api/admin/inventory/clear` |
| **New:** recovery panel (Settings → Advanced) and a "replacements paused" banner | `/api/recovery`, `/api/recovery/acknowledge` |

**Automatic refresh:**
- Screens re-read data every **2 minutes** while the tab is visible, and pause when it's hidden.
- Analytics are re-read every 10 minutes.
- This keeps Google Sheets reads well under the quota (about 60 reads per minute for the service account).
- Changes inside MCube reach the sheet through the scheduled jobs (see `V86-AUTO-SYNC.md`).

**Not included or limited:**
- The **access log** is not shown in the UI (no endpoint); it stays in the `User_Activity_Logs` tab.
- The **admissions zones** are hidden.
- The 3D people and ticket animation are illustrative and labelled as such.
- The agent list shows agents who currently hold a DID; full directory details open per agent.
- The **public support form** stays on the current site. Its Turnstile check is tied to that site's hostname.

## Verified before release (local copy of the real backend, fake Google Sheets + fake MCube)

`tools/dev-harness/` runs the real `backend/` with in-memory Google Sheets and a fake MCube API, using synthetic data only.
Browser tests ran against it in the same cross-site setup as Render (static site plus backend with CORS):

- **Login:** a wrong PIN is refused; the right PIN plus the emailed code signs in.
- **Sessions and roles:** an operator sees no Settings and the backend refuses them too; an invalid or expired session returns to the login screen.
- **Replacement from the queue:** it goes through deactivate → activate → verify, writes the full Change_Logs journal, and the request is completed.
- **Other actions:** review approve, Settings save (stored as a number, audit row written) and inventory sync all work.
- **MCube rejects an activation:** the dialog says so, the request is marked `needs_reconciliation`, and Risk Radar shows it as Critical.
- **MCube's response is uncertain:** the batch stops, and the UI shows "replacements paused" and refuses new ones. After an admin acknowledges the batch in Settings, replacements are allowed again.
- **Layout:** no horizontal overflow on 24 screens at 320 / 360 / 390 / 430 / 768 / 820 px.
- **Tests:** 19 backend tests and 8 calculation tests pass.

This was **not** tested against your real Google Sheet, real MCube or real Brevo (no credentials here). Please do the staging check below.

## Step 1: backend (v86 + nothing new for v87)

Upload `backend/main.py` (v86 scheduler change) to `main`. Render redeploys the backend; the current UI keeps working.
Set up the cron-job.org entry from `V86-AUTO-SYNC.md`.

## Step 2: try it safely first (recommended)

1. Make a copy of the Google Sheet (File → Make a copy). Share it with the same service account.
2. In Render, create a second **web service** from the repo (same settings as the backend), with the same environment variables except:
   - `GOOGLE_SHEET_ID` = the copy's ID;
   - `ADMIN_EMAIL` / `OPERATOR_EMAIL` and PIN hashes for your testers;
   - `STATIC_FRONTEND_ORIGINS` = the test static site URL from step 3.
3. Create a **Static Site** for it as in Step 3, but with `BACKEND_PUBLIC_URL` set to this test backend.
4. ⚠️ The test backend still talks to the **real MCube**. Inventory sync and call sync only read from MCube (they write to the copied sheet).
   **A replacement changes the real agent's DID in MCube**, so only test replacements on a test agent/DID you are happy to change.

## Step 3: production

1. In Render, create a **New → Static Site** from this repository:
   - Build command: `bash build-static-next.sh`
   - Publish directory: `frontend-next/dist`
   - Environment variable: `BACKEND_PUBLIC_URL=https://YOUR-BACKEND.onrender.com`
   - No rewrite rules are needed (the app uses `#/` links).
2. In the **backend** service → Environment, add the new site's URL to `STATIC_FRONTEND_ORIGINS`, comma-separated, **keeping the current site**.
   For example: `https://current-site.onrender.com,https://supporthub-new.onrender.com`. Render restarts the backend.
3. Open the new site and sign in. Check the dashboard counts against the sheet, run "Refresh from MCube", open a request, and check Settings → Advanced (scheduled jobs, recovery).
4. Share the new URL with the team. Both sites work side by side on the same backend and data.

## Rollback

Use the old site's URL; it is unchanged. To remove the new UI completely, delete the new Static Site and remove its URL from `STATIC_FRONTEND_ORIGINS`.

## Local development

```bash
python tools/dev-harness/run_dev.py          # real backend + fake Sheets/MCube on :5301 (see tools/dev-harness/README.md)
cd frontend-next && npm run dev:live         # new UI in live mode against it (http://localhost:5173)
cd frontend-next && npm run dev              # new UI on sample data
```
