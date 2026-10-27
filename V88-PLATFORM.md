# v88: App Launcher, User Management, custom reports, trend ranges

## What changed

- **App Launcher after sign-in** (works like Salesforce):
  - Each user sees only the apps they are allowed to open.
  - The grid button at the top left of every app switches apps.
  - A user with one app, or with a default app set, goes straight into it.
- **Apps:**
  - **DID Replacement**: the existing app, unchanged.
  - **User Management**: new.
  - **DEB Operations**: listed as *Coming soon*.
- **User Management** (super administrator, plus anyone given User Management access):
  - **Users & Access**: add users with their own PIN; activate or disable them; pick a role per app; set the app that opens after sign-in. Active and disabled users are listed separately.
  - **App Settings**: switch an app off for everyone (the super administrator keeps access) and set the message users see.
  - **Global Settings**: organisation name, session length (1–12 h), allowed email domains for new users, and a notice on the launcher.
  - **Audit Log**: every access change, plus every sign-in and change request (`User_Activity_Logs`).
- **Custom Reports** (DID → Reports):
  - Pick the data, columns, date range, filters, grouping and sort.
  - Save a report privately or share it with the team; start from templates.
  - Export to CSV.
- **Export on every table:** shown columns or all columns. The CSV opens correctly in Excel.
- **Trend ranges:** 24 h, 7, 15 or 30 days, or custom dates. Used by Pool activity, Utilization trend and Requests over time. Ranges of 7 days or more read every Change_Logs row in the range, not only the latest 500.
- **Agent 360:**
  - Separate **Active** and **Deactivated** lists.
  - Deactivated means one of two things: MCube status is not active, or the agent is no longer in the MCube employee directory.
  - A warning shows when a deactivated agent still holds a DID.
- **Dialogs** (Replace DID and others) now open in the middle of the screen, without extra scrolling.
- **Less text** across the app: explanatory sentences and subtitles that added nothing were removed.

## Google Sheets (new tabs, created automatically on first use)

| Tab | Holds |
|---|---|
| `Platform_Users` | email, name, status (active/disabled), PIN hash (pbkdf2), default app, notes, who changed it and when |
| `Platform_App_Access` | email, app, role, granted/revoked |
| `Platform_Settings` | scope (`global` or an app id), key, value |
| `Platform_Audit` | every User Management change |
| `Platform_Saved_Reports` | saved custom reports (deleted ones are marked, not erased) |

No existing tab is changed.

## Sign-in rules (backward compatible)

- **With the new tabs empty, sign-in works exactly as before.** `ADMIN_EMAIL` is the administrator. `OPERATOR_EMAIL` and `OPERATOR_USERS_JSON` are DID operators with their PINs from the environment.
- **`ADMIN_EMAIL` is the super administrator.** It is always active, always has every app, and cannot be changed or disabled from the sheet (prevents lock-out).
- **Users added in User Management** sign in with the same email → PIN → emailed code flow.
- **Access changes apply within 30 seconds**, without signing out.
- **Disabling a user** blocks sign-in and their open session.
- **If Google Sheets is unreachable:**
  - Environment users keep their previous access.
  - Users added only in User Management cannot sign in until it is back (fail closed).

## New API endpoints

| Endpoint | Who can call it |
|---|---|
| `GET /api/me` | Any signed-in user. Now also returns `apps`, `can_manage_users` and `session_hours`; `role` is still the DID role. |
| `GET/POST /api/platform/users` | User Management |
| `GET/PUT /api/platform/settings` | User Management |
| `GET /api/platform/audit` and `/api/platform/access-log` | User Management |
| `GET/POST /api/platform/reports` and `DELETE /api/platform/reports/{id}` | The signed-in user |
| `GET /api/employees` | DID app (read-only Employee_Directory) |
| `GET /api/logs?days=N` | DID app. Every row of the last N days. Without `days`, unchanged (last 500 rows). |

## Adding another app later

1. Add it to `APPS` in `backend/platform_access.py` (id, name, roles).
2. Add its screens and its home route in `frontend-next/src/lib/data/platform.js` (`APP_HOME`).
3. Access, the launcher and per-app settings then work automatically.

## Tests

- `tests/test_platform_v88.py` has 13 tests. All 32 backend tests pass.
- `frontend-next/tests/calc.test.mjs` adds tests for date ranges and reports.
