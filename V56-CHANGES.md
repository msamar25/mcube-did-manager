# v56 — Responsive mobile and identity audit

- Responsive navigation and compact account menu on phones.
- Account popover now shows user icon/avatar, green active-session dot, verified login email, role and Sign out only.
- `GET /api/me` returns the authenticated session email and role.
- New Google Sheets tab `User_Activity_Logs` with `time_ist,email,role,action,endpoint,result`.
- Successful OTP login is logged, as are authenticated POST/PUT/PATCH/DELETE operations (including signout). No PIN, OTP, token or request body is logged.
- Logging failures are reported to backend logs, but do not interrupt sign-in or an operation; monitor errors and Sheets permissions. This is an application-level audit, not a tamper-proof journal.
- The operator can still access all pages except Settings. Settings remains in the top navigation for administrators only.
