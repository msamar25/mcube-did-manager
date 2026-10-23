# v85 Operations Studio — deployment notes

This release changes frontend presentation and loads the 3D canvas on demand. It does **not** change FastAPI, cron, Google Sheets, MCube API calls, authentication, DID replacement or the public support form.

## Changes
- Cleaner white Operations Studio design and responsive navigation treatment.
- Page context bar, inventory sync indicator and manual refresh action.
- Optional 3D: operator analytics is the default Intelligence tab; the 3D component is downloaded only after selecting **Explore in 3D**.
- Responsive loading state and accessible error fallback for 3D import.
- Existing operator, pool, agent, SLA, risk and export views preserved.

## Deployment
1. Back up currently deployed v84.
2. Upload extracted project files to GitHub `main`.
3. Render Static Site: build `bash build-static.sh`, publish `frontend/dist`.
4. Confirm build succeeds before rollout; do not remove the existing backend.
5. Smoke test dashboard, Request, Intelligence tabs, 3D orbit/zoom, reports, login, form and DID replacement.
6. Check browser network: 3D component should be fetched only after clicking Explore in 3D.

## Validation limits
ZIP integrity and local static checks completed. npm package installation/build is blocked by unavailable npm registry network in this environment. This is a **release candidate**, not a production-verified build. Render build and live integration smoke tests are required.
