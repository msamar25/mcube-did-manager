# V73 — Public branding and request source

- Removed “No login required” from the public form; uses supplied UNext logo URL with text fallback.
- Request search now includes full request UUID and stable human-facing SH- ticket number.
- Request table shows Ticket and Source; filter All / Call / Form / Both.
- Source derived from existing immutable `Call_Request_Events` and `Public_Request_Events` tabs, with counts; no destructive Google Sheets schema migration.
- When a call and public form share an existing open request for the same MCube agent number, both events reference the same request_id. Queue displays Call + Form; each source remains auditable separately.
- Once a request is closed, a later submission opens a new request; events remain attached to their original tickets.
- Caution: public submission increments legacy `call_count` even for form events. Source-specific counts in the new queue are authoritative; a future version could rename legacy count to interactions.
