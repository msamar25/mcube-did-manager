// Server readiness. Render Free puts the backend to sleep when idle; the first request can take ~50 s.
// `waitForServer()` pings /api/health and drives the "Preparing your workspace" screen.
import { api } from './data/api.js';
import { LIVE } from './data/source.js';

export const wake = $state({ step: LIVE ? 'server' : 'ready', show: false, since: Date.now(), failed: false });
// step: server → services → workspace → ready

let running = null;
export function waitForServer() {
  if (!LIVE) return Promise.resolve(true);
  if (running) return running;
  wake.since = Date.now(); wake.failed = false; wake.step = 'server';
  // only show the screen if the server doesn't answer quickly (no flash when it's already awake)
  const reveal = setTimeout(() => { if (wake.step !== 'ready') wake.show = true; }, 1200);
  running = (async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await api('/api/health', { auth: false, timeout: 60000 }); wake.step = 'services'; return true; }
      catch { await new Promise((r) => setTimeout(r, 3000)); }
    }
    wake.failed = true; return false;
  })().finally(() => { clearTimeout(reveal); running = null; });
  return running;
}
export function wakeStep(step) { wake.step = step; if (step === 'ready') wake.show = false; }
export function retryWake() { wake.show = true; return waitForServer(); }
