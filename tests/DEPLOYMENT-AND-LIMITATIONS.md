# MCube DID Manager – deployment and operational notes

## Current implementation

- Active/inactive/pool MCube DID snapshots in Google Sheets; FIFO rebuilds when pool membership changes.
- Sequential DID reassignment; deactivation must succeed before activation; live verification and append-only change logs.
- Two login tokens: administrator (`APP_TOKEN`) and operator (`OPERATOR_TOKEN`). Operator can reassign DIDs, sync requests, and see queue; only admin can edit settings, refresh employee directory manually and approve/reject repeat requests.
- Persistent settings in Google Sheets (`App_Settings`), append-only `Settings_Audit_Log`, version-check on writes.
- Inbound calls filtered server-side using saved `request_did` (`clicktocalldid`); further filters `direction=inbound`, `dialstatus=cancel`, `callto=agent_no`; dedupe by `callid`; pending agent calls increase `call_count`.
- Three-day repeat detection from completed `Change_Logs`, configurable; review-required queue entries cannot be reassigned until admin approval.
- MCube outbound call to configured first contact when queued (opt-in), periodic reminder to first/second contact (opt-in), and agent after successful replacement (opt-in).
- SMTP email on queue and completion (opt-in; requires approved SMTP account).
- Employee directory can be refreshed daily by optional maintenance tick.

## Setup

1. Create a private GitHub repository containing this project. Never commit real MCube tokens or service-account JSON.
2. Create a Google Sheet, share it with your Google service account (Editor), enable Google Sheets API.
3. On Render, deploy via `render.yaml` as a single Python web service. Set environment variables:
   - `APP_TOKEN` (administrator login, strong secret)
   - `OPERATOR_TOKEN` (different strong secret)
   - `MCUBE_BEARER_TOKEN` (MCube DID / outbound token)
   - `MCUBE_CONFIG_TOKEN` (MCube config API session token; may expire frequently)
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (entire JSON key)
   - `GOOGLE_SHEET_ID` (spreadsheet ID)
   - Optional SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
4. Open app. Sign in as administrator. Go to Settings and enter the `request_did`, first/second reminder recipients and outbound caller number; Save. Enable notifications only after testing.
5. Refresh DID inventory first. Refresh employee directory and test inbound call sync with a known test call. Check the queue and `Notification_Logs`.
6. Test one non-production reassignment and confirm deactivation, activation, inventory refresh, completion notification and audit logs before any bulk use.
7. To run periodic maintenance, set GitHub repository **Actions secrets** `MCUBE_APP_URL` (full https://...onrender.com) and `MCUBE_APP_ADMIN_TOKEN` (same value as Render `APP_TOKEN`). Enable GitHub Actions workflow `.github/workflows/mcube-hourly.yml`. It runs approximately hourly; GitHub scheduled jobs may be delayed. Manual app sync is also available.

## Important limitations / do not enable unattended production yet

- MCube `filter-inbound` and `emp-filter` response envelopes have not been provided. Their parsers are defensive but **must be tested against real redacted responses**. `emp-filter` authorization may be an expiring web-session token and may not work as a stable service integration.
- MCube `outbound-calls` initiates a call. It **does not guarantee a recorded audio message or call delivery**. This app records only API submission, not that the recipient heard a notification.
- The outbound API's `exenumber` / `custnumber` semantics and any MCube call charges must be verified with a test. Do not configure arbitrary recipients without their consent.
- Render Free may sleep and restart. GitHub hourly maintenance is best-effort, not real-time. Configurable reminder intervals below 60 minutes cannot be guaranteed with this scheduler.
- Google Sheets is not transactional. A single-process lock prevents concurrent work only within the current instance; no durable distributed lock. A restart can interrupt a batch; review logs and MCube state before retry. Failed or uncertain operations must be reconciled manually.
- API status checking and live MCube verification do not guarantee zero downtime. Partial failures may leave an agent without a DID until manually resolved.
- Login is shared-token role based, not named per-person accounts; audit actor shows role, not individual user. Stronger authentication should be added before broad rollout.
- `Pending_Requests` is a current-state sheet (rewritten on status changes); `Call_Request_Events`, `Change_Logs`, `Notification_Logs`, `Settings_Audit_Log` are append-only.
- Email uses SMTP SSL; Microsoft 365 tenants may disable basic SMTP authentication. Use an approved sender or add Microsoft Graph OAuth integration.
- The current app has not been exercised against live MCube or Google Sheets; production readiness requires integration tests.

## v3 verified response mapping and safeguards (19 October 2026)
- The `filter-inbound` response has top-level `clicktocall` (not a generic wrapper). Only fields `callid`, `callto`, `clicktocalldid`, `direction`, `dialstatus`, `starttime`, `endtime` are extracted. Reject calls whose `clicktocalldid` does not equal saved request DID, direction is not inbound, or dialstatus is not CANCEL.
- The inbound `callto` **must** match the active DID listing's `agent_no` after conservative India +91 phone normalization. Employee directory membership alone never qualifies a request. Duplicate active agent numbers are rejected as ambiguous. Recheck assignment from live MCube immediately before replacement.
- The `emp-filter` response has top-level `employees` (675 entries in supplied sample). Cache only employee phone, name, email and timestamp; no raw responses, tokens, SIP details, LSQ callbacks or other employee data are saved.
- MCube `outbound-calls` reports initiation with `status: "succ"` and a `callid`; the app treats only that shape as submitted and records only the callid and short message, never the token or raw response.
- Call times without an explicit timezone are interpreted as Asia/Kolkata and persisted as UTC ISO timestamps. Pending requests deduplicate by callid and by active agent phone. Three-day review checks Change_Logs; direct reassignment blocks recent agents too.
- API schema and backend syntax verified using supplied JSON samples and local unit tests; live MCube and Google Sheets integrations **not tested**.
- Known operational limitation: Google Sheets is not a transactional lock, so only run one backend worker and one scheduler. Render Free sleep and hourly GitHub Actions do not guarantee minute-accurate reminder intervals.
