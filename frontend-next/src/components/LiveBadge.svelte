<script>
  // "Live · updated 12 s ago" — the time of the last successful data check (live feed or full refresh).
  import { pulse, live } from '../lib/store.svelte.js';
  import { LIVE } from '../lib/data/source.js';
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  let at = $derived(Math.max(pulse.at || 0, live.last || 0));
  let secs = $derived(Math.max(0, Math.round((now - at) / 1000)));
  let txt = $derived(!LIVE ? 'Sample data' : !at ? 'Connecting…' : pulse.error || live.error ? 'Reconnecting…' : secs < 60 ? `Live · updated ${secs}s ago` : `Live · updated ${Math.round(secs / 60)} min ago`);
</script>
<span class="lb" class:warn={!LIVE || pulse.error || live.error} title="Ticket statuses are checked every {pulse.every} s; all data every {live.every / 60} min"><i></i>{txt}</span>
<style>
  .lb { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 650; color: #067647; background: #ecfdf3; border: 1px solid #abefc6; padding: 3px 9px; border-radius: 99px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .lb i { width: 7px; height: 7px; border-radius: 50%; background: #12b76a; box-shadow: 0 0 0 3px rgba(18,183,106,.2); animation: p 1.8s infinite; }
  .lb.warn { color: #a35f00; background: #fffaeb; border-color: #fedf89; } .lb.warn i { background: #f79009; box-shadow: 0 0 0 3px rgba(247,144,9,.2); }
  @keyframes p { 50% { opacity: .4; } }
  @media (prefers-reduced-motion: reduce) { .lb i { animation: none; } }
</style>
