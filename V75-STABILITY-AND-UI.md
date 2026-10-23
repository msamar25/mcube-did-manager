# v75 — stability and UI improvements

- Analytics is now an overview with KPIs and trend/status charts; Report contains detailed tables, exports and audit events. Both use the same dataset but are no longer redundant.
- Public form Cloudflare Turnstile is displayed in a horizontal action row next to Submit on desktop, stacking on narrow phones. Normal-size widget avoids the tall compact challenge. The widget is shown only when form details pass local validation.
- Google Sheets replacement writes new data first and clears only stale trailing rows afterward, preventing the previous destructive clear-first failure. Not transactional; use one worker and maintain backups.
- Call sync creates a separate ticket for a changed DID instead of discarding the event; the previous ticket remains open for manual reconciliation.
- Request activity and ticket timelines compare normalized ISO/IST timestamps; activity aggregation is linear in events.
- Analytics no longer forces form-only tickets to have one call.

## Deployment cautions
- Keep one Render worker. Google Sheets remains nontransactional and cross-process locking is not provided.
- Take a Google Sheets backup before deployment.
- Browser testing and real MCube/Google Sheets integration tests are still required.
