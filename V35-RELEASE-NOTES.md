# v35 — Compact operations workspace and monthly QC reporting

## Frontend
- Searchable, scrollable DID and request grids, with sticky column headings.
- Page-size choices 10, 25, 50, 100 and previous/next pagination for DID and request tables.
- Request row actions: administrator Approve/Reject where eligible; individual Replace opens the existing server-verified FIFO confirmation (no direct MCube call).
- Compact headings, toolbar, KPI spacing and mobile responsive controls.
- Profile dropdown for settings and logout; no fabricated notification feed.
- Checkout-style review steps in the existing request replacement confirmation.
- Monthly per-agent request frequency with month/search filters, 10–100 rows/page and CSV export.

## Backend
- `/api/insights` includes `monthly` aggregates by request first-call month and agent number, including distinct requests, inbound calls, completed and rejected requests.
- Existing API endpoints and manual approval/FIFO execution unchanged.
- Manager/TL values are current directory mappings, not historical snapshots.

## Validation / limitations
- Backend compiles successfully. Frontend production build was not possible in this environment (npm registry packages unavailable offline); test build in CI/staging.
- The monthly report counts only records with valid first-call timestamps; it cannot reconstruct historical requests not retained in Google Sheets.
- Automatic data synchronization remains dependent on the existing maintenance scheduler and settings.
