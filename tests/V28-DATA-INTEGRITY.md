# v28 Call ID and DID data integrity

- Call_Request_Events adds two columns at the end: `current_did` (the assigned DID at ingestion) and `request_did` (the inbound request DID used to filter the MCube API).
- Preserves original eight columns and existing rows; no destructive migration or guessed backfill.
- Sets column A of Call_Request_Events to Plain text before new writes, and appends call IDs using RAW.
- Rejects scientific notation or floats as call IDs rather than fabricating incorrect digits.
- Existing numeric IDs already rounded by Google Sheets cannot be restored from the sheet. Recover them from the MCube API/source export. Historical events can remain as an audit trail; manually reconcile before re-importing old calls.
- `callto` is the employee mobile; `current_did` is the active DID; `request_did` is the shared inbound call number. These must not be conflated.
- Filter remains exact (case-insensitive) `direction=inbound` and `dialstatus=CANCEL`.
- Google Sheets is not a transactional database; concurrent sync executions still require a distributed lock for full protection.
