# v74 — Unified ticket lifecycle and audit

- Call-created and form-created tickets share a stable SH- UUID-derived identifier; historical IDs do not change.
- Public form submissions no longer inflate `call_count` or alter `last_call_utc`. New form-only records have call_count=0 and no last_call timestamp. Historic contaminated counters are displayed using actual Call_Request_Events counts instead.
- Existing open requests are merged only when BOTH registered mobile and currently assigned DID match; mismatched DIDs are skipped for manual reconciliation on call sync.
- Each incoming call/form is stored as its own immutable event; an append-only Ticket_Events sheet captures ticket creation, repeat activity, approval, rejection and verified completion. Historic call/form events remain readable.
- Request API returns source_counts, total_interactions, last_activity_utc. Calls column reflects actual call events.
- Ticket number is clickable; ticket details show status, identity, DID, channel counters and a time-ordered history from source events and audit events.
- Completion audit is written only after verified MCube reassignment.
- Initial call notifications are tied to creation of a ticket, not call_count (fixes form-first case).

## Limitations and safe rollout

- Ticket IDs remain deterministic from UUID (collision-resistant); no independent ticket ID sheet or sequence is introduced to avoid unsafe Google Sheets migration.
- Call triggers do not contain a structured issue category. The current safe matching policy is one open replacement ticket per employee + DID, and form descriptions are preserved in event history. Distinct issue-category ticket routing is not yet implemented.
- Ticket_Events is new and will be created by Google Sheets on first append or timeline read. Existing records show their call/form events, but historical approvals from before v74 may not be reconstructable.
- Form throttling remains in-memory; use shared persistent rate limiting before scaling to multiple Render workers.
- Google Sheets is not transactional. Cross-sheet writes can partially succeed; review logs after API errors. Avoid multiple backend workers until write coordination is implemented.
- Test with a copy of the Google Sheet before production rollout: call-first, form-first, repeats, same mobile with changed DID, approvals, rejected tickets, failed activation, verified completion.
