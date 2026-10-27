<script>
  // 24 h / 7 / 15 / 30 days / custom dates. Shared by all trend charts.
  import { range, PRESETS, saveRange, ensureRangeLogs, rlogs } from '../lib/range.svelte.js';
  let { compact = false } = $props();
  const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
  function set(p) { range.preset = p; if (p === 'custom' && !range.from) { range.from = new Date(Date.now() + 330 * 60e3 - 13 * 864e5).toISOString().slice(0, 10); range.to = today; } saveRange(); }
  $effect(() => { range.preset; range.from; range.to; ensureRangeLogs(); });
</script>
<div class="rp" class:compact>
  <div class="seg" role="tablist" aria-label="Date range">
    {#each PRESETS as [k, l]}<button class:on={range.preset === k} onclick={() => set(k)}>{l}</button>{/each}
  </div>
  {#if range.preset === 'custom'}
    <input class="input d" type="date" max={today} bind:value={range.from} onchange={saveRange} aria-label="From" />
    <span class="muted">–</span>
    <input class="input d" type="date" max={today} min={range.from} bind:value={range.to} onchange={saveRange} aria-label="To" />
  {/if}
  {#if rlogs.loading}<span class="spin" aria-label="Loading"></span>{/if}
</div>
<style>
  .rp { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .rp .seg button { padding: 0 9px; font-size: 12px; }
  .d { width: 138px; height: 30px; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--brand); animation: s .8s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
</style>
