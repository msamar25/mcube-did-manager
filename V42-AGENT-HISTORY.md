# v42 — Agent profiles and persistent history

- Dedicated full-screen agent detail page, with current DID, manager, team lead, request history, and verified replacement timeline.
- New Google Sheets tab `Agent_Replacement_History` is created automatically on first successful verified reassignment or manual history synchronization.
- Admin-only `POST /api/agent-history/sync` backfills existing successful `REASSIGNMENT_COMPLETE` events from `Change_Logs` using stable event IDs to prevent duplicates.
- `GET /api/agents/{agent_number}/profile` reads live Google Sheets data, including unsynced verified Change_Logs entries.
- Existing Change_Logs remains the authoritative immutable journal. If the history materialization fails after a DID change, the change is still recorded and can be backfilled.
- Manager and team lead in historical backfills are current directory values at synchronization time, not guaranteed historical values.
- Do not delete or edit `Change_Logs` rows: backfill identifiers include original row positions.
- Existing MCube integration APIs remain unchanged.
