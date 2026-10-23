# v84 Phase 4 — Operations Risk Radar

## Included
- New **Intelligence → Risk radar** tab with responsive white/orange UNext-style design.
- Configurable (local-only) low operator pool threshold, repeat agent requests, pending ageing, stale inventory sync.
- Duplicate DID inventory warnings.
- Read-only findings, CSV export and direct Agent 360° drill-down.
- No new MCube/Sheets API calls, backend endpoints, scheduled jobs, environment variables or replacement logic changes.

## Accuracy
- This release provides transparent **rule-based early warnings**, not machine-learning predictions.
- Historical DID pool exhaustion forecasting is **not** implemented without reliable timestamped inventory snapshots.
- Ageing uses first-call or request-created timestamps. No SLA promise is inferred.
- An absence of alerts does not guarantee data quality.
- Source data can be stale; check last synchronization.

## Deployment
- Backup your working v83 source. Upload extracted project files to GitHub `main`.
- Redeploy Render Static Site (backend unchanged).
- Open Intelligence → Risk radar. Test thresholds, export, profile links and existing operations.
- Run the Render frontend build and smoke-test before rolling out broadly.

## Design strategy for next UI iteration
- Keep tickets, DID replacement and admin workflows in a fast 2D interface.
- Make the immersive operator universe optional and load it only on selection.
- Consider a proper Three.js/WebGL scene only after validating usability and performance on common team devices.
- Use vector/CSS UI, semantic status colors, one shared filter bar, drill-down drawers, keyboard navigation and reduced-motion support.
- Avoid office-floor replicas or employee physical-location representation; abstract operator islands and pool movements are a better fit.
