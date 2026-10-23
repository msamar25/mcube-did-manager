# UNext SupportHub v82 — Phase 2 DID Intelligence

## New navigation
Open **Intelligence** in the top navigation after logging in.

## New read-only views
- Operator analytics: assigned, available, other, duplicates, utilization and CSV export.
- Pool intelligence: operator-filtered pool cards, utilization, CSV export.
- Agent intelligence: requests, repeat requests, inbound calls, completions, average turnaround, and links to existing Agent 360 profile. CSV export includes all matching records.
- SLA/ageing monitor: adjustable 8/24/48/72-hour **monitoring threshold**, not a contractual SLA. CSV export.
- Freshness indicator based on the last synchronized DID inventory.

## Scope and caveats
- Existing DID replacement, support form, authentication, scheduled sync, MCube calls and Google Sheets writes are unchanged.
- No new MCube calls or new Google Sheets tabs are introduced by Phase 2. It reuses /api/insights and the already loaded inventory and requests.
- The operator 'utilization' denominator is assigned + available DID records in the current snapshot; common pool and unclassified entries are shown separately.
- Employee/manager relationships in /api/insights are current directory attributes, not historical reporting lines.
- No historical pool forecast or reliability scoring is fabricated; these require validated historical snapshots.
- CSV export is client-side; avoid sharing employee numbers outside authorized operations staff.

## Deployment
1. Keep a backup of the currently deployed version.
2. Upload all extracted project files to GitHub main; deploy the Render Static Site. Backend code is unchanged from v81.
3. Verify login, DID replacement page, support form and cron job URLs.
4. Open Intelligence in the top navigation and test each tab and CSV export.
5. Click an agent in Agent intelligence and confirm the Agent 360 profile opens.

## Validation
Code inspection completed. npm dependencies could not be installed in the available environment; production Svelte build and live integration have **not** been verified. Do not treat the package as fully production-tested until Render build and smoke tests pass.
