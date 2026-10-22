# v54 Dashboard and Employee Directory
- Email is resolved from Employee_Directory.agent_number -> email and matched to active DID agent_no (frontend normalized agent_number). No DID API email is assumed.
- Google Sheets reads preserve employee phone values as strings; no numeric conversion of phone identifiers.
- Lookup failure now appears in a dismissible toast, and failed lookups are labeled 'Lookup unavailable' instead of falsely claiming a missing employee email.
- Compact 15/85 desktop DID layout, reduced header whitespace, fixed action column and five-row-friendly table sizing.
- Icon controls include accessible names and tooltips; CSV exports visible columns.
- Column visibility dialog and duplicate-DID scrollable dialog replace the dashboard inline duplicate section.
- No automatic DID replacement introduced; pagination, bulk selection, and individual reassignment retained.

## Deployment validation
Frontend Vite build not verified here because npm dependency installation timed out. Run `cd frontend && npm ci || npm install && npm run build` in staging. Check GET /api/employees/lookup with a signed-in account: directory_rows, matched, and rows_with_phone; if a 503 occurs, inspect backend Google Sheets logs and spreadsheet permissions. A failed Sheets read cannot be fixed by a UI-only change.
