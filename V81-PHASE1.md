# UNext SupportHub v81 — Phase 1: Agent 360° / DID Passport

## What changed
- Added an **Agent 360° Event Timeline** to the existing agent profile page, displaying timestamped entries from `Change_Logs` including failures and uncertain steps. Download CSV.
- Added a **DID Passport** modal on the agent profile showing historical logged operations involving the selected DID and the latest cached `Active_DIDs` assignment. Download CSV.
- Added authenticated `GET /api/dids/{did}/passport` and `GET /api/intelligence/current-conflicts` (current-snapshot duplicate check only).
- Extended the existing agent profile API with `lifecycle_events` and `history_scope`.
- No MCube API calls, no new Google Sheets writes, no new cron jobs, no change to reassignment execution or authentication.

## Accuracy boundaries
- Historical data only exists where `Change_Logs` recorded it. Missing earlier assignment periods are **unknown**.
- DID Passport current assignment is from the last synchronized `Active_DIDs` snapshot, **not a live MCube query**.
- `current-conflicts` detects snapshot duplicate DID/agent mappings; it **does not assert historical overlapping time windows**.
- The existing `Agent_Replacement_History` remains the verified replacement summary.
- Full lifecycle event sourcing, historical interval-overlap auditing, inventory snapshots, and 3D visualization are separate future phases. They are **not** claimed as complete in this build.

## Deployment
1. Back up your current working GitHub branch and Render environment.
2. Extract ZIP and copy project files to your repository `main` branch (preserve existing environment variables).
3. Deploy backend and static frontend. No new environment variables or Google Sheets tabs required.
4. Sign in, go to Analytics/Report and click an agent's name to open Agent 360°. Verify timeline and DID Passport.
5. Compare one known `REASSIGNMENT_COMPLETE` against Change_Logs; test export; test public form, DID replacement safeguards and cron status.

## Validation
Python source compilation completed. Full Vite production build was **not run successfully** in the execution environment because npm dependency installation did not complete. Do a production build in CI/Render before rollout. No live integration test was performed.

## Office branding references
The supplied office photographs are design inspiration for future 3D work (warm UNext orange, bright architectural space, circular lobby motif). No employee photographs are embedded in this phase; no exact office location or layout is reproduced.
