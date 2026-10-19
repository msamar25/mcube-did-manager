# MCube DID Manager v11 — initial inventory and settings

1. Upload all files in `mcube-did-manager/` to the root of the existing private GitHub repository.
2. Render deploys the latest commit; keep existing environment variables.
3. Sign in as administrator and open Dashboard. If `Sync_Status` has no completed import, choose **Import MCube DID inventory**.
4. The backend fetches active, inactive, pool from MCube and creates `Active_DIDs`, `Inactive_DIDs`, `DID_Pool_FIFO`, `Sync_Status` in Google Sheets. It does not initiate calls or change DID assignments.
5. Go to Settings, check the values and save. The UI performs a backend readback before confirming success.
6. Check Render logs for traceback if any Sheets or MCube API request fails.

**Important:** A fresh Sheet has no data until the first explicit inventory import. A 403 indicates Sheets API or spreadsheet-sharing permissions. No multi-worker deployment: single Render process only. Keep automated reminders and replacement disabled until integration tests pass.
