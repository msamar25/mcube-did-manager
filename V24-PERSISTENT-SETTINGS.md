# v24 — Persistent settings workspace

- Rebuilt Settings into compact category navigation: request intake, MCube login, call notifications, replacement rules, email, employees, advanced.
- Every non-secret user-editable setting in `Workflows.DEFAULTS` is now represented in Settings, including the previously hidden legacy fallback phone numbers and request sync lookback.
- The UI uses the existing `App_Settings` Google Sheets worksheet, reads on opening Settings, writes on Save, and verifies the saved version by reading back. No browser-only storage for application configuration.
- Encrypted MCube login credentials are stored separately in `MCube_Config_Credentials`; encryption key is kept in Render.
- Session secrets, Brevo API key, Google service account, MCube REST bearer token, and encryption key MUST stay in Render environment variables; never put them in GitHub or Sheets.
- Save settings before leaving Settings; a confirmation warns if edits have not been saved.
- Existing Sheets configuration is preserved across refreshes, redeploys and Render resumes as long as the same Google spreadsheet is connected.
- Existing app business logic, endpoints and safe defaults are unchanged.
- Google Sheets writes are not transactional; use one Render worker and back up Sheets.
