<script>
  // Accessible 2D alternative to the 3D Support Hub (also the mobile view).
  // Every zone is a real <button> so it works with keyboard and screen readers.
  import { TICKET_ZONES, ADMISSIONS_ZONES, ADMISSIONS_ENABLED } from '../lib/support.js';
  let { data = {}, selected = null, onpick = () => {}, compact = false } = $props();
  const A = [['enquiries', '#f59e0b'], ['guidance', '#3b82f6'], ['application', '#3b82f6'], ['payment', '#22c55e']];
  const T = [['incoming', '#f59e0b'], ['progress', '#3b82f6'], ['resolved', '#22c55e'], ['failed', '#ef4444']];
  const n = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('en-IN'));
  const isOn = (k) => selected?.type === 'zone' && selected.key === k;
</script>

<div class="map" class:compact>
  {#if ADMISSIONS_ENABLED}
  <div class="row top" role="group" aria-label="Admissions journey">
    {#each A as [k, c]}
      <button class="z" class:on={isOn(k)} style="--c:{c}" onclick={() => onpick({ type: 'zone', key: k })}>
        <span class="dot"></span><span class="t">{ADMISSIONS_ZONES[k].label}</span><b>{n(data.admissions?.[k])}</b><small>preview</small>
      </button>
    {/each}
  </div>
  {/if}
  <button class="hub" class:on={selected?.type === 'hub'} onclick={() => onpick({ type: 'hub' })} aria-label="UNext L1 Support Hub, {n(data.open)} open tickets">
    <svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="smu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9a1f" /><stop offset="1" stop-color="#e63a1c" /></linearGradient></defs>
      <path d="M6 6h8v16c0 4 2.5 6.5 6 6.5S26 26 26 22V6h8v16.5C34 31 28 36 20 36S6 31 6 22.5z" fill="url(#smu)" /></svg>
    <span><b>UNext SupportHub</b><small>L1 Support · {n(data.open)} open</small></span>
  </button>
  <div class="row bottom" role="group" aria-label="Ticket lifecycle">
    {#each T as [k, c]}
      <button class="z t-{k}" class:on={isOn(k)} style="--c:{c}" onclick={() => onpick({ type: 'zone', key: k })}>
        <span class="dot"></span><span class="t">{TICKET_ZONES[k].label}</span><b>{n(data.counts?.[k])}</b>
      </button>
    {/each}
  </div>
</div>

<style>
  .map { display: grid; gap: 10px; padding: 12px; position: relative;
    background: radial-gradient(circle at 50% 50%, rgba(255,138,61,.16), transparent 55%), #f6f4f1; border-radius: 16px; }
  .row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .z { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'd t' 'b b' 's s'; align-items: center; column-gap: 6px; text-align: left; padding: 9px 10px; border-radius: 12px; border: 1px solid #ebe7e2; background: #fff; font: inherit; color: var(--ink); cursor: pointer; min-width: 0; box-shadow: 0 1px 2px rgba(20,26,38,.05); position: relative; }
  .z::after { content: ''; position: absolute; left: 50%; width: 2px; height: 10px; background: color-mix(in srgb, var(--c) 60%, #fff); }
  .top .z::after { bottom: -11px; } .bottom .z::after { top: -11px; }
  .z:hover, .z.on { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 20%, transparent); }
  .dot { grid-area: d; width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 20%, transparent); }
  .t { grid-area: t; font-size: 11.5px; font-weight: 600; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .z b { grid-area: b; font-size: 18px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .z small { grid-area: s; font-size: 9.5px; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }
  .bottom .z { background: color-mix(in srgb, var(--c) 7%, #fff); }
  .hub { justify-self: center; display: flex; align-items: center; gap: 10px; padding: 10px 18px 10px 12px; border-radius: 999px; border: 2px solid #ff8a3d; background: #fff; font: inherit; cursor: pointer; box-shadow: 0 0 0 6px rgba(255,138,61,.12), 0 10px 24px -12px rgba(242,107,29,.6); }
  .hub.on { box-shadow: 0 0 0 6px rgba(255,138,61,.3); }
  .hub svg { width: 30px; height: 30px; } .hub span { display: grid; text-align: left; line-height: 1.2; } .hub b { font-size: 14px; } .hub small { font-size: 11px; color: var(--muted); }
  @media (max-width: 560px) { .row { grid-template-columns: repeat(2, minmax(0, 1fr)); } .z::after { display: none; } }
  .compact .z { padding: 7px 8px; } .compact .z b { font-size: 16px; }
</style>
