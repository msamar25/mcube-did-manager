<script>
  import Drawer from './Drawer.svelte';
  import Badge from './Badge.svelte';
  import OpChip from './OpChip.svelte';
  import Icon from './Icon.svelte';
  import { getDidPassport } from '../lib/data/source.js';
  import { ist, downloadCsv } from '../lib/format.js';
  let { did = null, onclose = () => {} } = $props();
  let data = $state(null);
  $effect(() => { data = null; if (did) getDidPassport(did).then((d) => (data = d)); });
</script>
<Drawer open={!!did} title="DID Passport · {did || ''}" sub="Cached Active_DIDs mapping + logged operations" {onclose}>
  {#snippet actions()}<button class="btn btn-sm" disabled={!data?.events.length} onclick={() => downloadCsv(data.events, `did-${did}-passport.csv`)}><Icon name="download" size={13} />CSV</button>{/snippet}
  {#if !data}<div class="empty">Loading…</div>{:else}
    <div class="panel panel-pad">
      <div class="panel-title" style="margin-bottom:8px">Current snapshot</div>
      {#each data.current as c}
        <div class="row" style="justify-content:space-between;padding:4px 0"><span><b>{c.agent || 'Unassigned'}</b> <span class="muted">{c.agent_number}</span></span><span class="row"><OpChip name={c.operator} /><Badge status={c.status} />{#if c.duplicate}<Badge status="critical" label="Duplicate" />{/if}</span></div>
      {:else}<div class="muted">Not present in the latest snapshot.</div>{/each}
    </div>
    <div class="panel panel-pad">
      <div class="panel-title" style="margin-bottom:8px">Logged operations ({data.events.length})</div>
      <div class="tl">
        {#each data.events as e}
          <div class="ev"><span class="dot" class:bad={e.result === 'FAILED'} class:ok={e.event === 'REASSIGNMENT_COMPLETE'}></span><div><b>{e.event.replace(/_/g, ' ')}</b><small>{ist(e.time_utc)} · batch {e.batch_id}</small><small>{e.old_did} → {e.new_did || '—'} · {e.agent_name}</small></div></div>
        {:else}<div class="muted">No logged operations for this DID.</div>{/each}
      </div>
    </div>
    <div class="note"><Icon name="info" size={14} />History exists only where Change_Logs recorded it. Earlier periods are unknown.</div>
  {/if}
</Drawer>
<style>
  .tl { display: grid; gap: 10px; }
  .ev { display: flex; gap: 10px; } .ev div { display: grid; font-size: 12px; } .ev small { color: var(--muted); font-size: 11px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--info); margin-top: 4px; flex: none; box-shadow: 0 0 0 3px var(--info-50); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-50); } .dot.bad { background: var(--bad); box-shadow: 0 0 0 3px var(--bad-50); }
</style>
