# v89: permissions, one session per user, live 3D, data setup, import requests

## Settings: where each one lives

| Level | Where | What |
|---|---|---|
| **Global** (every user, every app) | User Management → Global Settings | Organisation name, session length, **one active session per user** (on by default), allowed email domains, launcher notice |
| **Per app** | User Management → App Settings | App on/off and maintenance message. **Role permissions** for each app, e.g. which roles see Settings or the Audit log. |
| **Per user** | User Management → Users & Access | Apps and role per app; per-permission **Allow / Deny / Role default**; default app; status |
| **Inside an app** | DID Replacement → Settings | The DID app's own settings (intake, safety, calls, email, employees, credentials, data setup). Independent of other apps. |

### DID permissions

| Permission | Default roles | Controls |
|---|---|---|
| Settings & data setup | admin | Settings pages, Data Setup, clear snapshots, recovery acknowledge |
| MCube credentials | admin | Credentials page and endpoints |
| Audit log | admin | Reports → Audit Log, and the Change log dataset in Custom Reports |
| Run DID replacements & reviews | admin, operator | Reassign, approve/reject, import requests |
| Reports & exports | admin, operator | Replacement History, Custom Reports, every Export button |

- The defaults equal the previous rules, so nothing changes until you edit them.
- The backend enforces Settings, Credentials and Replacements; a request without the permission gets HTTP 403.
- The Audit log page and its export are hidden without the permission. The dashboards still read the change log internally to calculate their charts.

## One session per user

- Signing in again elsewhere ends the earlier session. That browser shows "You were signed out because this account signed in on another device or browser."
- Sign-out ends the session too.
- The current session of each user is stored in the new tab `Platform_Sessions`, so the rule still works after a backend restart.
- You can turn it off in Global Settings.
- Sessions issued before v89 keep working until each user's next sign-in.

## Live 3D stats

- The "Illustrative" labels on the Dashboard and the Command Center are replaced by **Live · updated N s ago**.
- `GET /api/live` returns every ticket's status. It reads the sheet at most once every 15 seconds, however many people are watching, and the screens check it every 20 seconds.
- Status changes play first in 3D, with their ticket number and a LIVE tag. After that, the most recently active real tickets play, each travelling only as far as its real status.
- A finished or failed replacement triggers a full refresh (inventory, logs).
- The people at desks are scenery. The login page backdrop is still marked illustrative, because no data is loaded before sign-in.

## Completed replacements

- **Replacement Queue** has a Completed tab: old DID → new DID, completion time and how long it took. All five status tiles are clickable, and rows open the ticket details.
- **Command Center:** clicking a board (Incoming, In progress, Resolved, Failed) lists its tickets, and each opens the details. There is also a Completed Replacements link.
- **After a replacement**, the window re-reads the inventory and shows **Updated DIDs**: the old DID's and the new DID's status from the refreshed snapshot. "Open DID Inventory" shows just those lines. The backend rewrites the snapshot after each verified agent, as before.

## Data Setup (DID → Settings → Data Setup, Settings permission)

**First-time sync.** One button runs these four steps in order, with progress:
1. inventory,
2. employee directory,
3. request-line calls,
4. replacement history.

If a step fails, the run stops there, and you can retry from that step.

**Clear data**
- Choose tab groups: inventory snapshots, requests/calls/ticket events, notifications, employees, history, change log and queue, job status, activity logs.
- Each tab is first copied to `Backup <tab> <date time>` in the same Google Sheet and the copy is verified. Then only its data rows are cleared; the header row is kept.
- You must type `CLEAR_SELECTED_DATA` to confirm.
- It is refused while a replacement is running or unresolved, or while replacements are queued.
- Never cleared: `App_Settings`, `MCube_Config_Credentials` and every `Platform_*` tab.
- It is recorded in Change_Logs (`DATA_CLEARED`) and in the User Management audit.

## Import requests (Support Requests → Import requests, Replacement permission)

- **Input:** paste numbers or emails in any format, or upload a .csv or .txt file. Entries are split automatically: emails by their `@domain`, and numbers into 10 digits (`+91` and a leading `0` are removed, and numbers run together are split). The parsed list is shown before you import.
- **Comment:** required (who raised it and why). It is stored on the ticket as `REQUEST_IMPORTED`.
- **Checks:** each entry must match **one active employee** in the MCube employee directory who holds **one active DID** and has no open request.
- **Results:** imported lines are listed. Failed lines are listed separately with the reason, and the list can be downloaded as CSV. The reasons are:
  - invalid number;
  - number not found;
  - email not found;
  - deactivated in MCube;
  - no active DID;
  - more than one DID;
  - already open;
  - listed twice.
- Imported requests show the channel **Imported** and go through the normal recent-replacement review.

## Other changes

- Analytics → **Team Insights** (renamed from Team Performance).
- The Support Requests channel filter no longer shows Call + Form tickets under every filter.

## New Google Sheets tabs

- `Platform_Permissions`
- `Platform_Sessions`
- `Backup …` tabs (only when you clear data)

## Tests

- Backend: 40 tests, including `tests/test_platform_v89.py`.
- UI calculations: the date-range and paste-parser tests in `frontend-next/tests/calc.test.mjs`.
- End to end on the local test setup: one session per user, permission override, live labels, Completed tab and ticket details, import, a replacement with the Updated DIDs list, first-time sync and clear data.
