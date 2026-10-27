# UNext SupportHub: redesigned frontend (design preview)

This is a Svelte 5 + Vite + Three.js app. **Phase 1 uses labeled sample data only.** It makes no API calls, so it can run without the backend.

```bash
cd frontend-next
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
```

- `?q=high` or `?q=low` forces the 3D quality level. By default it's picked automatically (low on phones and low-power devices).
- Pick the Administrator or Operator role on the sign-in screen, or switch later from the user menu.
- Data facade: `src/lib/data/source.js`. Sample data: `src/lib/data/mock.js`. 3D scene: `src/three/CommandScene.js`.

See `../docs/REDESIGN-PHASE1.md` for the audit, the design notes, the validation results and the Phase 3 plan.
