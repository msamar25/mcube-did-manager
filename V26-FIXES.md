# v26 — Request queue and reminders

- Request sync accepts only `direction: inbound` and `dialstatus: CANCEL` (case-insensitive).
- Employee matching still requires `callto` in saved employee directory and a unique active DID before actionable replacement.
- Reminder results now distinguish submitted, rejected, skipped and uncertain from eligibility and not-due counts.
- Escalation explicitly routes to Level 2 configured numbers.
- Naive historical timestamps are interpreted as UTC; offset-aware timestamps preserve IST.
- A reminder attempt is journaled before MCube call initiation; uncertain attempts are never automatically repeated.
- Refresh queue separately fetches requests and notifications and reports failures by source.
- This does not add a background scheduler. `/api/maintenance/tick` still requires an external schedule.
- Test against MCube sandbox/test account before enabling live calls.
