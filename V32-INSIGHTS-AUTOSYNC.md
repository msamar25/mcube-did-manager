# v32 Analytics, Reports and Scheduled Sync

- Analytics and Report are now backed by `/api/insights` reading existing Google Sheets; no replacement action is triggered by viewing reports.
- Employee directory now includes agent_id, role, status, role3, role4 and role5, enabling manager and TL reporting. Employee sync replaces the Employee_Directory sheet with the expanded columns when fields change. Back up the tab before first sync.
- Manager/TL labels come from the current MCube employee directory; historical reporting is attributed to the employee's current hierarchy, not necessarily the hierarchy at the time of a past call.
- Requests and calls are separate; a repeated call within the same request increases call_count rather than creating a new request.
- The report's verified replacement count is derived from Change_Logs `REASSIGNMENT_COMPLETE` events. Historical rows missing from the audit log cannot be reconstructed.
- In Settings -> MCube and request intake, configure inventory refresh, call sync and employee refresh intervals (minutes). Save settings to Google Sheets.
- Set an external cron service to POST `https://YOUR-RENDER-SERVICE/api/maintenance/tick` every five minutes, header `Authorization: Bearer YOUR_MAINTENANCE_TOKEN`. The endpoint checks each saved interval before making a remote call. Do not expose this token in frontend settings or source code. Disable other schedulers to prevent duplicate ticks.
- The Render free instance may sleep. The external cron will wake it; network operations still depend on the service, MCube and Google Sheets being available.
- No automatic DID replacement has been introduced. Automatic sync is read-only inventory and directory refresh plus inbound call import; existing reminder notifications run under their existing settings.
- Validation: Python compile succeeded. Frontend npm dependencies could not be installed in this environment, so a frontend production build was not verified.
