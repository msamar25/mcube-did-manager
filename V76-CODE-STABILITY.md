# v76 — code-level stability corrections

## Fixed
- Call synchronization matches pending tickets by `(employee_number, current_did)` rather than only employee number. Multiple open DID contexts no longer overwrite one another in the lookup.
- Google Sheets replacement verifies that the newly written row identifiers are present in order before clearing stale trailing rows. If verification fails, trailing rows are retained and an error is raised. This is not a transaction and does not protect against concurrent workers.
- Older call tickets with no Call_Request_Events records now preserve their historical `call_count` as the source count rather than always showing one call.
- Public-form in-memory rate limiter periodically prunes expired keys to prevent unbounded growth.

## Remaining operational risks
- Keep one backend worker/instance: Google Sheets updates and in-memory rate limits are not distributed transactions.
- Take a backup before upgrading; test real Google Sheets value formatting and update behavior in staging.
- A form-created ticket still uses legacy `first_call_utc` as its creation timestamp; changing this safely requires a data migration.
- Partial failure between writing a ticket and appending its event remains possible; a durable outbox/database is needed for atomic event handling.
- MCube and Turnstile live integrations not exercised in this environment.
