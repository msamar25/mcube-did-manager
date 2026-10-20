# v16: Indian Standard Time
- UI request first/last calls and inventory sync times render as DD Mon YYYY, hh:mm:ss AM/PM IST, independent of browser timezone.
- Newly imported call event starttime/endtime/ingested_utc and request first_call_utc/last_call_utc are written as timezone-aware ISO 8601 with +05:30 offset; existing UTC rows remain readable and are displayed in IST.
- Historical Google Sheets rows are NOT bulk rewritten. Existing column names ending _utc are retained for backward compatibility, though newly written values contain the +05:30 offset.
- Internal elapsed-time calculations continue using timezone-aware datetimes. Dates in replacement dialogs use the India calendar day.
- No MCube mutation logic or authentication settings changed.
