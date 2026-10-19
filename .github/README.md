# MCube DID Manager

Svelte 5 + Vite + FastAPI, designed for one Render web service.

## Important: API integration pending

The actual MCube activate/deactivate cURL requests have **not** been supplied. The backend uses placeholder JSON field mapping (`did`, optional `agent`). **Do not use against live numbers until `build_payload`, authentication headers, request format, and response success validation are adapted to your real API specifications.** The optional DID listing endpoint currently returns an empty list; you can manually add DIDs to the current browser session.

## Local development

Install Node.js 20+ and Python 3.11+.

```bash
cd backend
pip install -r requirements.txt
cd ..
export APP_TOKEN='choose-a-long-random-secret'
export MCUBE_ACTIVATE_URL='https://your-actual-activate-endpoint'
export MCUBE_DEACTIVATE_URL='https://your-actual-deactivate-endpoint'
uvicorn backend.main:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173. Sign in using APP_TOKEN. The Vite dev server proxies `/api` to FastAPI.

## Render deployment

1. Push this folder to a private GitHub repository.
2. In Render select **New > Blueprint**, connect the repository and apply `render.yaml`.
3. Enter `APP_TOKEN`, `MCUBE_API_KEY`, `MCUBE_ACTIVATE_URL`, and `MCUBE_DEACTIVATE_URL` in Render's environment settings.
4. Deploy. Build produces `frontend/dist`, served by FastAPI.
5. Validate API mappings with a test DID and test credentials before production use.

The Render free service may sleep after inactivity and cause cold-start delays. A paid always-on instance is recommended if instant first-load matters.

## Security and production readiness

- Use a strong random `APP_TOKEN` and HTTPS. Token-based access here is a starter solution, not a multi-user identity system. Add user accounts/roles and audit records for production.
- MCube credentials stay on the backend and in Render environment variables; never put them in frontend code.
- Add MCube status verification, provider-specific success checks, durable audit logging, rate limits and CSRF/CORS review before enabling production operations.
- Do not log API secrets or full DID numbers.
- Provider timeouts can leave ambiguous results: check status before retrying.

## October 2026 sequential reassignment implementation

**Environment variables:** `APP_TOKEN`, `MCUBE_BEARER_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` (full service-account JSON), `GOOGLE_SHEET_ID`. Share the sheet with the service account's email as Editor. MCube production host is the default; override `MCUBE_BASE_URL` if needed.

1. Deploy and sign in. Click **Refresh** to fetch all three MCube inventories and persist snapshots.
2. Select active agents, up to pool count; click **Reassign selected (FIFO)**.
3. Backend executes one agent at a time: fresh inventory -> deactivate -> activate -> verify -> snapshot. Every API stage is appended to `Change_Logs`.
4. FIFO is rebuilt in MCube response order when the pool's membership changes, not merely when its count changes.
5. Browser navigation is disabled while the tab observes the batch. Browser-level navigation cannot be fully prevented. The server may continue processing if the tab is closed, but a Render Free restart can interrupt it.

**Operational safety:** Google Sheets is not a transactional database. This version serializes operations within a single Python process. Configure Render for one worker and one instance. Do not run multiple app instances against the same MCube business. Before running any new batch after an interrupted or uncertain batch, manually reconcile `Change_Logs` with live MCube state. **Never blindly retry a timed-out activation or deactivation.** The service-account credentials and bearer token must remain server-side. Existing tokens shared in chat should be rotated.

**First test:** Use a dedicated test agent and DID; verify the actual API envelope, response `status`, list timing and propagation before enabling live bulk changes. The provider API may be eventually consistent. The app intentionally stops if verification does not confirm the new assignment.
