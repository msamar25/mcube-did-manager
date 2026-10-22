# v27: Request sync connection diagnostics

- Report the failing Google Sheets tab and operation instead of the generic `ConnectionError`.
- Retry transient Google Sheets connection failures for **read-only** operations (up to three attempts).
- Report MCube login connection, inbound API connection, and HTTP response errors separately.
- Do not retry non-idempotent writes or MCube outbound calls automatically.
- Preserve inbound + exact CANCEL + employee `callto` matching.

If an error persists, check Render Logs for `Request sync stage failed`, `MCube inbound request network failure`, or `Call sync failed`. Do not share tokens or full request headers.

Known pre-existing test issue: `tests/test_matching.py::test_timezone` expects UTC output but v26 intentionally returns IST; that assertion was not changed in this diagnostics patch.
