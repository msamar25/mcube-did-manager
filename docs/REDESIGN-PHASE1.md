# UNext SupportHub redesign: Phase 1 and 2 (design preview)

Branch: `redesign/premium-ui`. Status: **waiting for design approval. Nothing is connected to production.**

The redesign lives in `frontend-next/`, a separate Svelte 5 + Vite app. The production `frontend/` and `backend/` folders, `render.yaml`, `build-static.sh` and the GitHub Actions workflow are all **unchanged**.

---

## 1. Repository audit (main @ `a7a4b62`, v8.256)

| Area | Finding |
|---|---|
| Frontend | Svelte 5 + Vite 6. One 107 KB `App.svelte` plus a 113 KB `style.css`. Lazily loaded `DidUniverse.svelte`, which is a **2D canvas** projection, not WebGL. `RiskIntelligence.svelte` holds the v84 rules. Icons from `lucide-svelte`. |
| Build | `vite build` **succeeds** on the current `frontend/` (verified in this session; earlier release notes said it was never run). |
| Backend | FastAPI, `backend/main.py` (about 1,470 lines, 44 routes) + `workflows.py`. Single-process operation lock (`operation_lock.py`), Brevo email (`brevo.py`), encrypted MCube config login (`mcube_config_auth.py`). |
| Auth | Email + PIN (hash in env, or `OPERATOR_USERS_JSON`) → one-time code by email → signed 8-hour session token. Roles: `admin`, `operator`. Settings and credential APIs are admin-only (v50). |
| Storage | Google Sheets via gspread, with quota-aware retries and a 10 s snapshot cache for inventory tabs only. Tabs: `Active_DIDs`, `Inactive_DIDs`, `DID_Pool_FIFO`, `Sync_Status`, `Change_Logs`, `Agent_Replacement_History`, `Pending_Requests`, ticket/call/form event logs, `Employee_Directory`, settings + settings log, access log, operation queue, request mutations. |
| Safeguards | One agent at a time: fresh inventory → deactivate → activate → verify. Stops on failed or uncertain steps and never blindly retries. Every stage is appended to `Change_Logs`. FIFO order is rebuilt from MCube responses. Recent-replacement review gate. Admin-only snapshot reset with a typed confirmation. |
| Public form | `/support-request`: agent_number, employee_name, email, issue_summary, honeypot, Cloudflare Turnstile (fails closed). |
| Scheduling | GitHub Actions calls `POST /api/maintenance/tick` hourly (Render Free sleeps). |
| Deploy | `render.yaml` defines one Python web service (free) that builds the frontend and serves `dist`. `build-static.sh` and the v85 notes describe a **Render Static Site** variant using `BACKEND_PUBLIC_URL`. Confirm which one is live before Phase 3. |
| Notes | `frontend/src/App.svelte` has an unused `execute()` that posts to `/api/did/{action}`, a route that doesn't exist. It's dead code and harmless, but worth removing later. `tests/` contains an older full copy of the project (backend, frontend and release notes) next to the real tests. |

## 2. Design direction

- **Reference 1 (Command Center)** sets the layout for *DID Command Center → 3D Overview*: top navigation, a section sidebar, a 3D stage with a 3D/2D/Map switch and filters, a right-hand column (Total DIDs, Operator Distribution, DID Utilization) and a bottom row (Recent Requests, Pool Activity, Utilization Trend).
- **Reference 2 (Nexora)** sets the style of the **Dashboard** and the overall system: a light-blue "clay" 3D scene behind floating glass cards, compact KPI rows, soft shadows, orange accents and Inter type.
- **Office photos** are cues only. The central hub is a stylized version of the round UNext tower (glass rotunda, stone band with a U mark, disc canopy). The agent platform uses orange desk partitions. No people or photos are embedded.
- Operator colours were checked with the colour-blind validator: Vodafone red, Idea amber, Airtel **teal** (moved off red so it can't be confused with Vodafone), Jio blue. Operators show as a coloured initial; brand logos are not reproduced.

## 3. What was built (`frontend-next/`)

| Module | Route |
|---|---|
| Sign-in (email + PIN → OTP, role preview) | shown when signed out |
| Dashboard (Nexora-style, clay 3D background) | `#/dashboard/overview` |
| DID Command Center: interactive Three.js scene, 2D top view, SVG Map view | `#/command/3d` |
| DID Inventory (active / pool / inactive, duplicates, DID passport, reassign) | `#/command/inventory` |
| Operator Analytics | `#/command/operators` |
| Pool Intelligence (FIFO queue, distribution, 24 h flow) | `#/command/pool` |
| Agent 360° (profile, current DID, timeline, verified history) | `#/command/agent` |
| Replacement Queue (ready / review / processing / failed, FIFO plan) | `#/command/replacement` |
| Risk Radar (same rules as v84, adjustable, export) | `#/command/risk` |
| Support Requests (+ ticket timeline drawer, review action) | `#/requests/queue` |
| Public Request Form preview | `#/requests/public-form` |
| Notifications | `#/requests/notifications` |
| Analytics: Request Insights, Team Performance | `#/analytics/*` |
| Reports: Audit Log, Replacement History, Exports | `#/reports/*` |
| Settings: 7 sections with the same keys and labels as production | `#/settings/*` (admin only) |

**3D scene** (`src/three/CommandScene.js`). Every model is built in code; no images or GLB files are loaded.
- Four operator islands with tiered skyscrapers, window façades (windows lit at random), corner accent lights, antennas with blinking beacons, lawns and paths. The main tower's height scales with each operator's DID count.
- The hub rotunda, rotating light rings, the glowing phone orb and a point light.
- The DID pool: a glass vault with server racks and orbiting holographic DID cards.
- The agent floor: 19 desks with monitors, chairs, agents with headsets and partitions.
- The replacement conveyor: a moving belt, status gates and packages coloured by stage.
- Glowing network roads with moving data packets, about 200 trees, and a distant skyline.

Rendering uses physically based materials, soft shadows, environment lighting and a glow pass limited to the neon accents. Controls: orbit, zoom and pan with damping. Clicking a building or label selects it and the camera flies to it. There are reset and auto-orbit buttons, and a lower-quality mode for low-power devices.

Performance: about 140 draw calls and about 110k triangles per frame. Three.js is a separate lazily loaded chunk (129 KB gzipped). Rendering pauses when the tab is hidden, the stage is off-screen, or Map view is open. Browsers without WebGL get a fallback message, and the Map view still works.

**Data.** `src/lib/data/mock.js` holds seeded sample data whose field names match the Sheets and API responses. Every screen reads through `src/lib/data/source.js`. Each function there is annotated with the FastAPI endpoint that will replace it in Phase 3. A permanent "Design preview · sample data only" badge is shown. Actions that would change data (reassign, sync, save settings, credentials, reset) only show a simulation or a notice and **make no network calls**.

## 4. Validation (Phase 2)

- `npm run build` in `frontend-next/` succeeds with no Svelte compiler or accessibility warnings.
- Browser: Playwright with Chromium (software WebGL in this sandbox).
  - 20 screens × 3 sizes (desktop 1672×941, tablet 820×1180, mobile 390×844) = 60 screenshots, with no console errors and no horizontal overflow.
  - At desktop size, 17 of 20 screens fit without scrolling; Agent 360°, Risk Radar and Request Insights scroll by 30–100 px.
- Interaction tests that pass: sign-in (email → PIN → OTP), operator selection from the 3D scene, 2D and Map views, agent/DID search, the reassignment simulation, the ticket drawer, and operator-role permissions (Settings hidden and blocked).
- Fixed during validation:
  - glow pass washing out the scene
  - fog too close
  - road surfaces facing down
  - a crash from a negative curve position
  - clipped right column
  - search icons misplaced
  - 3D labels showing through overlays
  - mobile camera framing (zoom limit, wider lens)
  - mobile overflow (KPI text, unwrapped tables)
  - background seam
  - sample timestamps in the future

### Remaining gaps against the references
- The references are offline renders. The live scene is real-time, so its buildings are simpler, with less detail and lower texture density than Reference 1.
- Operator logos are coloured initials, not brand marks.
- The Dashboard's clay scene is lighter and less dense than the Nexora illustration.
- On phones, the 3D view is necessarily small; the panels below carry the detail.
- Blender wasn't available here, so no GLB assets were made. The procedural models can be exported to GLB later if wanted.

## 5. Phase 3 plan (only after approval)

1. Replace each `source.js` function with a fetch to the existing endpoint, module by module. Remove the mock data from each module as it's connected.
2. Swap the session for `/api/auth/start`, `/api/auth/verify` and `/api/me`, plus the existing 401 / session-expiry handling.
3. Route reassignment through `/api/requests/reassign` and `/api/batch` polling, with the existing navigation lock while a batch runs.
4. Keep FastAPI, Sheets, MCube, cron and Turnstile logic unchanged. The new UI uses only the existing endpoints.
5. Cut over by pointing the Render build at `frontend-next` (or renaming it to `frontend`) only after a side-by-side smoke test.

---

## Phase 2 refinement (round 2)

Changes made after design review feedback:

- **3D Command Center reconceived as one UNext office floor** (no separate operator buildings). The scene follows the real process:
  agents raise a DID replacement request → the **UNext Support Team** hub (centre) takes a new number from an **operator DID vault** (Vodafone, Idea, Airtel, Jio, with logos) → the **replacement conveyor** moves it through Pending → Processing → Completed / Failed → back to the **agent desk rows**.
- Glossy reflective floor, operator-coloured vault outlines, glowing network lanes, soft shadows, UNext reception with the "u" mark and office plants.
- **Label overlap fixed:** labels are placed by priority and any label that would overlap another, a control or the stage edge is hidden; operator cards are pinned inside the stage. On smaller stages the cards collapse to logo + name. Filters moved to a toolbar above the stage so they never cover the scene.
- Operator logos (simplified drawings) on the vaults, label cards, detail panel and all table chips.
- **New login page** for the whole SupportHub (students, counsellors, support team), with the official UNext logo and a new 3D scene: a glossy gradient "u" with an orbit of graduation cap, laptop, books, headset, ticket and chat bubble.
- Official UNext SVG logo in the header, login page and public form (`src/assets/unext-logo.svg`).
- Visual polish: glass panels, table headers, Agent 360° banner header and day-grouped timeline, Replacement Queue pipeline strip, Inventory operator chips, Audit Log summary cards, opaque menus, a one-line preview badge.

### Remaining differences that need professional 3D assets
- Reference 1 is a pre-rendered image. Detailed people, furniture, server hardware and architectural trim at that level need hand-modelled GLB assets (Blender) plus baked lighting. The live scene uses simplified procedural shapes: capsule people, box racks, flat desks.
- Ray-traced reflections and depth of field from the reference are approximated with a planar mirror and bloom.
- Operator logos are simplified redraws. Licensed brand SVGs should replace them before production.

---

## Phase 2 refinement — UNext L1 Support Operations Hub (Dashboard hero)

Built from reference image 12. Still preview only: mock data, no backend wiring, not deployed.

### What was built
- **New 3D scene** `src/three/SupportHubScene.js`, lazy-loaded by `components/SupportScene.svelte`.
  - Central raised steel-and-glass platform with orange light rings and a glass balustrade.
  - The UNext "u" is extruded from the official logo SVG, with an orange gradient, a glowing disc and a halo.
  - A "UNext SupportHub" band wraps the dais.
  - Ten illustrative L1 agents sit at desks around the hub, typing.
- **Eight zones** joined to the hub by glowing pathways:
  - Admissions (back arc): Student Enquiries, Counsellor Guidance, Application Processing, Payment & Enrollment.
  - Ticket lifecycle (front arc): Incoming Tickets, In Progress, Resolved, Failed.
  - Each zone is a glass-partitioned pod with desks, agents, a wall display, a beacon and a readable HTML label.
- **Floor and surroundings:** pearl floor with a planar reflection (high quality only), concentric glow rings, potted plants and walking staff.
- **Signature loop (15 s, illustrative):**
  1. A ticket appears at an admissions zone (the zone rotates each loop).
  2. It moves to Incoming, then to the L1 hub. An agent's monitor lights up and the ticket turns amber → blue.
  3. It moves to In Progress, then ends in **Resolved** (green pulse). Every third loop it ends in **Failed** (red); failed is never shown as "escalated".
  4. A step chip under the scene names the current step.
- **Status mapping** (`src/lib/support.js`) uses the existing backend statuses only:
  - Incoming = pending + approved + review_required
  - In Progress = processing
  - Resolved = completed
  - Failed = failed
- **Data shown in the scene:**
  - Ticket counts come from the request records.
  - Admissions zone numbers are **preview data** and are tagged "preview". No admissions data exists in the backend.
- **Interaction:**
  - Click the hub or a zone (in 3D or on its label) for a detail panel. Ticket zones list the top requests and link to Support Requests with that filter (`#/requests/queue?status=incoming|processing|completed|failed`).
  - The camera flies gently to the selection. Reset view returns to the overview.
  - Desktop: orbit and zoom.
  - Touch: one finger scrolls the page; two fingers rotate and zoom.
  - The 3D/2D toggle shows an accessible 2D map built from real buttons (`components/SupportMap.svelte`).
- **Mobile (≤760 px):** no WebGL. A stacked layout shows the greeting, the 2D map (2 columns), compact KPIs, a detail panel and Risk Radar.
- **Performance:**
  - The scene loads lazily, with shared and merged geometry and instanced cards, people and plants.
  - The pixel ratio adapts to measured frame rate. Weak devices (≤4 cores or ≤4 GB) get the low-quality path, without the reflection.
  - It pauses when hidden or scrolled off-screen, freezes for reduced motion, and disposes everything on unmount.
  - Camera tweens run on wall-clock time.
  - The bloom pass was removed: on a light floor it washed the glowing paths into pastel. Halo sprites give the glow instead.
- **Labels:**
  - Labels never overlap each other or the overlay cards.
  - A label blocked by an overlay or the stage edge shifts to the nearest free spot (within 150 px) before it is hidden.
  - All nine labels were verified visible at 1366, 1920, 820 and 768 px.
- **DID Command Center:** the conveyor belt with boxes was removed. It now has a glass status path: four glass status pads (Pending → Processing → Completed / Failed) with light rings and screens, and small floating request cards. The operator gateways, the UNext Support Team hub and the agent rows are unchanged.
- **Overflow fixed at the root:**
  - The body-level `overflow-x: hidden` was removed.
  - Segmented controls now scroll inside themselves.
  - Audit: 24 screens × 6 widths (320, 360, 390, 430, 768, 820), with 0 elements past the viewport.

### Compared with reference 12
| Achieved | Simplified | Missing |
|---|---|---|
| Central glowing "u" on a raised glass/metal platform with orange rings and "UNext SupportHub" text | People are low-poly, procedurally animated figures, not detailed characters | Ray-traced reflections, soft global illumination, depth of field |
| L1 agents seated around the hub | Desks, chairs and monitors are simple shapes | Hand-modelled furniture and props (would need GLB assets) |
| 4 admissions + 4 ticket zones with glass partitions, desks, displays and readable labels | Plants are low-poly cones | Text on the wall displays (they show abstract scrolling lines) |
| Glowing pathways, floating ticket cards, a ticket travelling the whole lifecycle | Reflections only on the high-quality path | |
| Pearl reflective floor, plants, walking staff | Fewer pod details at tablet widths, where the camera frames the whole floor | |

---

## Accuracy, speed and log-based calculations (26 Oct)

**Calculations now match production and the real API** (`src/lib/calc.js`, with 8 unit tests in `frontend-next/tests/calc.test.mjs`; run `node tests/calc.test.mjs`):
- Utilization = assigned ÷ (assigned + available). "Common Pool" lines are excluded from assigned, as in production. All counts are unique DIDs.
- Operators are taken from the inventory data, not a fixed list. The real names (e.g. `opensips-jio5`, `opensips-tata13`) appear automatically, coloured by family.
- **Pool Activity · 24h:** verified replacements per hour (`REASSIGNMENT_COMPLETE` + `SUCCESS` in Change_Logs; exact), shown as bars. The pool level is walked back from today's pool.
- **Utilization trend · 7 days:** reconstructed per operator by undoing verified replacements day by day (IST days). Labelled as an estimate, because MCube pool top-ups are not written to Change_Logs.
- **Pool runway** = pool ÷ 7-day average replacements per day. **Assigned since** on DID Inventory comes from the DID's last verified replacement.
- `/api/logs` returns only the last 500 rows. The charts say so when the window isn't fully covered.
- Timestamps: Change_Logs IST offsets are honoured; values without an offset are read as UTC, exactly like production.
- Request statuses: `rejected` (closed at review) and `needs_reconciliation` (batch stopped; counted as In Progress and raised as a Critical Risk Radar alert) are now handled.
- `recent_warning` is stored as "yes"/"no", and is now read correctly (previously any value showed a warning). It comes from the backend's configured window.
- Replacement counts check `result = SUCCESS`; open requests exclude rejected ones.
- Sample data was reshaped to match the real API: no fabricated `since_utc` / `pooled_utc` / chart series, IST log timestamps and consistent replacement logs.

**Admissions zones hidden** (`ADMISSIONS_ENABLED = false` in `src/lib/support.js`; set it to `true` to bring them back). The 3D hub shows the 4 ticket zones in a ring, and new tickets enter from the floor edge.

**Speed:**
- Pages load on demand: the first download went from 258 KB to 138 KB (83 KB to 47 KB gzipped).
- Derived figures are cached per data load.
- Pages update live when data changes.
- Automatic background refresh every 60 s while the tab is visible (paused when hidden; the last good data stays on screen if a refresh fails), plus a "Refresh now" button.
