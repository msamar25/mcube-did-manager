# UNext SupportHub v83 — Phase 3: DID Operator Universe

## Scope
Adds a **3D Universe** tab inside the existing Intelligence navigation. This is a responsive, orbitable **isometric 3D-style canvas visualization** (software-projected 3D, not a WebGL scene), deliberately dependency-free to avoid CDN and npm costs.

## Features
- Rotatable camera by pointer drag, scroll zoom, zoom buttons and reset.
- Up to 16 largest operators displayed as extruded 3D towers, with tower heights driven by total DID count.
- Assigned (orange) and pool (blue) indicator bars based on the existing synchronized inventory.
- Select a tower to open existing operator analytics with its filter applied.
- Current assigned, pool, pending and duplicate metrics are read-only and sourced from the v82 state.
- Mobile-friendly and no additional MCube or Google Sheets requests.

## Existing behavior
No backend endpoints, cron, authentication, public form, DID assignment/replacement logic or Google Sheets writes changed.

## Deployment
Upload extracted project files to GitHub main. Deploy the existing Render Static Site. Existing backend need not be redeployed for this frontend-only release.
Open Dashboard -> Intelligence -> 3D Universe. Test orbit, zoom, operator selection, return to analytics and mobile.
Check dashboard, support form, replacement workflows, and cron independently.

## Limitations
- This is an interactive 3D-style isometric data visualization, **not** a photorealistic Three.js/WebGL environment. A higher-fidelity architectural 3D environment is a separate enhancement.
- The scene uses only the latest synchronized inventory; it does not reconstruct historical states.
- Operator counts are from existing v82 calculations, not live MCube polling.
- When more than 16 operators exist, the scene shows the largest 16; operator analytics still lists all.
- Production Svelte build was not executable in this environment due to missing npm dependencies. Deploy to Render and validate build before rollout.
