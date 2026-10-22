# v17 — IST throughout the application

- All newly generated backend audit, queue, sync, employee, notification, request and call timestamps use ISO 8601 with `+05:30`.
- All displayed timestamp fields on the Svelte dashboard and request views are formatted using `Asia/Kolkata` regardless of browser timezone.
- Replacement date pickers use the current Indian calendar date.
- Historical timestamps with an explicit UTC offset are converted for display.
- Existing Google Sheets column names containing `_utc` are preserved for backward compatibility; their new values carry the `+05:30` offset.
- Durations, reminders and comparisons remain timezone-aware; UTC may still be used internally for arithmetic.
- Existing Google Sheets rows are not rewritten. Existing date-only values are not time-shifted.
- For historical timezone-naive rows, confirm the original timezone before bulk conversion; the UI currently assumes UTC for legacy naive timestamps.
