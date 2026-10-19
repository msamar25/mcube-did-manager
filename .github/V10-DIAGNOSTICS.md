# v10 Backend diagnostics and error handling

This release makes backend failures actionable without leaking Google/MCube credentials to the browser.

- `/api/dids` logs a complete Python traceback for `NameError` and other snapshot failures.
- `/api/settings` and its save operation log full tracebacks and return structured HTTP 503 responses.
- `/api/sync` logs the full server traceback but returns a generic browser message.

**Important:** The uploaded log only said `Snapshot read failed: NameError` without the missing symbol name. It is impossible to verify a root-cause fix for that undefined symbol without the full traceback. This package is a complete deployable source tree with diagnostics, not a claim that the unidentified NameError has been eliminated.

Deploy the repo contents as before, then refresh Dashboard and search Render Logs for `Snapshot read failed (Google Sheets inventory)`. The final `NameError: name '...' is not defined` line identifies the exact remaining fix. Verify Google Sheets API is enabled in the project matching `GOOGLE_SERVICE_ACCOUNT_JSON.project_id`, and the service-account email has Editor access to `GOOGLE_SHEET_ID`.

Do not enable automated reminders or DID changes until the inventory, settings, and queue are confirmed healthy.
