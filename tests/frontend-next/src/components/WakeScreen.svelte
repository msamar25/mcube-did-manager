<script>
  // "Preparing your workspace" while Render wakes the backend (same idea as the previous UI's screen).
  import UnextLogo from './UnextLogo.svelte';
  import { wake, retryWake } from '../lib/wake.svelte.js';
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  let secs = $derived(Math.max(0, Math.round((now - wake.since) / 1000)));
  const STEPS = [['server', 'Connecting to the server'], ['services', 'Checking secure services'], ['workspace', 'Loading your workspace']];
  let idx = $derived(Math.max(0, STEPS.findIndex(([k]) => k === wake.step)));
  let text = $derived(wake.failed ? 'The server is not responding yet.' : wake.step === 'server' ? (secs < 8 ? 'Contacting UNext SupportHub…' : 'Waking up the server after a quiet period. This usually takes under a minute.') : wake.step === 'services' ? 'Verifying your secure session…' : 'Loading DIDs, requests and activity…');
</script>

<div class="wake" role="status" aria-live="polite">
  <div class="card">
    <div class="brand"><UnextLogo height={26} /><span class="sep"></span><span>SupportHub</span></div>
    <div class="art" aria-hidden="true">
      <div class="ring"></div><div class="ring r2"></div>
      <svg viewBox="0 0 40 40"><defs><linearGradient id="wku" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa733" /><stop offset="1" stop-color="#e63a1c" /></linearGradient></defs>
        <path d="M6 6h8v16c0 4 2.5 6.5 6 6.5S26 26 26 22V6h8v16.5C34 31 28 36 20 36S6 31 6 22.5z" fill="url(#wku)" /></svg>
    </div>
    <h1>Preparing your workspace</h1>
    <p>{text}</p>
    <div class="steps">
      {#each STEPS as [k, l], i}
        <div class="st" class:done={i < idx || wake.step === 'ready'} class:on={i === idx && !wake.failed} class:bad={i === idx && wake.failed}>
          <span class="sym">{i < idx ? '✓' : i === idx ? (wake.failed ? '!' : '') : ''}</span>{l}
        </div>
      {/each}
    </div>
    <div class="meta">{secs}s{#if secs > 20 && !wake.failed} · still working, please keep this tab open{/if}</div>
    {#if wake.failed}<button class="btn btn-primary" onclick={retryWake}>Retry connection</button>{/if}
    <p class="foot">Your session and saved requests are not changed by this screen.</p>
  </div>
</div>

<style>
  .wake { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 20px; background: radial-gradient(900px 500px at 70% -10%, #fde7d6 0%, transparent 60%), #fbfaf8; }
  .card { width: min(100%, 460px); text-align: center; padding: 28px 24px; border: 1px solid #eef0f4; border-radius: 22px; background: #fff; box-shadow: 0 24px 70px -30px rgba(23,34,58,.35); display: grid; gap: 10px; justify-items: center; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; color: var(--ink); } .sep { width: 1px; height: 20px; background: var(--line); }
  .art { position: relative; width: 120px; height: 120px; display: grid; place-items: center; margin: 4px 0; }
  .art svg { width: 58px; height: 58px; filter: drop-shadow(0 8px 16px rgba(242,107,29,.45)); animation: bob 2.4s ease-in-out infinite; }
  .ring { position: absolute; inset: 10px; border-radius: 50%; border: 3px solid #ffe3cf; border-top-color: #f26b1d; animation: spin 1.1s linear infinite; }
  .ring.r2 { inset: 0; border-width: 2px; border-color: #fff0e5; border-bottom-color: #ffb27a; animation-duration: 2.2s; animation-direction: reverse; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.02em; }
  p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45; min-height: 38px; }
  .steps { display: grid; gap: 6px; width: 100%; text-align: left; margin-top: 4px; }
  .st { display: flex; gap: 10px; align-items: center; font-size: 13px; color: #98a2b3; padding: 8px 12px; border-radius: 10px; background: #f8f9fb; }
  .st .sym { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; border: 2px solid #e4e7ec; flex: none; }
  .st.on { color: var(--ink); background: #fff4ec; } .st.on .sym { border-color: #f26b1d; border-top-color: transparent; animation: spin .9s linear infinite; }
  .st.done { color: #067647; } .st.done .sym { background: #12b76a; border-color: #12b76a; color: #fff; }
  .st.bad { color: #b42318; background: #fef3f2; } .st.bad .sym { border-color: #f04438; color: #f04438; }
  .meta { font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .foot { font-size: 11px; color: var(--faint); min-height: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes bob { 50% { transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .ring, .art svg, .st.on .sym { animation: none; } }
</style>
