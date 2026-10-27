<script>
  import { can } from '../lib/session.svelte.js';
  import { db, totals, opStats, since, refresh } from '../lib/store.svelte.js';
  import { syncInventory } from '../lib/data/source.js';
  import { isCommonPool } from '../lib/calc.js';
  import { route, go } from '../lib/router.svelte.js';
  import { ago, n, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import Icon from '../components/Icon.svelte';
  import ReassignModal from '../components/ReassignModal.svelte';
  import DidPassport from '../components/DidPassport.svelte';
  import { toast } from '../components/Toast.svelte';

  let t = $derived(totals());
  let ops = $derived(opStats());
  let sinceMap = $derived(since()); // assignment time from verified replacements in Change_Logs
  let status = $state(route.params.status || 'active'), op = $state(route.params.op || 'all'), owner = $state(route.params.owner || 'all'), dupOnly = $state(false), selected = $state([]), reassign = $state(false), passport = $state(null);
  // ?q=DID DID … (e.g. the DIDs just assigned by a replacement) shows only those lines, in every status
  let onlyDids = $state((route.params.q || '').split(/[\s,]+/).filter(Boolean));
  let rows = $derived(onlyDids.length ? db.inventory.filter((i) => onlyDids.includes(String(i.did))) : db.inventory.filter((i) => (status === 'all' || i.status === status) && (op === 'all' || i.operator === op) && (!dupOnly || i.duplicate) && (owner === 'all' || (owner === 'common' ? isCommonPool(i) : i.status === 'active' && !isCommonPool(i)))));
  // who holds the line: real agent vs MCube "Common Pool" (active, no agent)
  let ownerCounts = $derived({ agent: new Set(db.inventory.filter((i) => i.status === 'active' && !isCommonPool(i)).map((i) => i.did)).size, common: new Set(db.inventory.filter(isCommonPool).map((i) => i.did)).size });
  let dupActive = $derived(new Set(db.inventory.filter((i) => i.duplicate && i.status === 'active').map((i) => i.did)).size);
  const key = (r) => r.did + '|' + r.agent_number;
  let chosen = $derived(db.inventory.filter((i) => i.status === 'active' && !isCommonPool(i) && selected.includes(key(i))));
  const columns = [
    { key: 'did', label: 'DID', mono: true, strong: true, lock: true },
    { key: 'status', label: 'Status', custom: true, search: (r) => (r.status === 'pool' ? 'available pool' : r.status) },
    { key: 'operator', label: 'Operator', custom: true },
    { key: 'agent', label: 'Agent', custom: true, minWidth: '180px', search: (r) => (isCommonPool(r) ? 'common pool' : r.agent) },
    { key: 'agent_number', label: 'Agent number', mono: true },
    { key: 'when', label: 'Since / FIFO', custom: true, value: (r) => r.fifo ?? sinceMap.get(String(r.did)) ?? '' },
    { key: 'duplicate', label: 'Integrity', custom: true, value: (r) => (r.duplicate ? 1 : 0), search: (r) => (r.duplicate ? 'duplicate' : 'ok') }
  ];
  let syncing = $state(false);
  async function syncNow() { syncing = true; try { const r = await syncInventory(); const c = r.counts || {}; toast(c.active !== undefined ? `MCube sync complete · ${c.active} active, ${c.pool} in pool, ${c.inactive} inactive` : 'MCube sync complete'); await refresh(); } catch (e) { toast(e.message, 'bad'); } finally { syncing = false; } }
  // tab counts = rows shown in that tab (active includes Common Pool lines)
  let activeRows = $derived(new Set(db.inventory.filter((i) => i.status === 'active').map((i) => i.did)).size);
  let tabs = $derived([['active', 'Active', activeRows], ['pool', 'Available pool', t.pool], ['inactive', 'Inactive', t.inactive], ['all', 'All', db.inventory.length]]);
</script>

<PageHead title="DID Inventory" sub="Synced {ago(db.lastSync)}" eyebrow="Command Center">
  {#snippet actions()}
    <button class="btn" disabled={syncing} onclick={syncNow} title="Reads active, inactive and pool lists from MCube and rewrites the snapshot tabs"><Icon name="refresh" size={14} />{syncing ? 'Syncing with MCube…' : 'Refresh from MCube'}</button>
    {#if can.reports()}<button class="btn" onclick={() => downloadCsv(rows, `did-inventory-${status}.csv`)}><Icon name="download" size={14} />Export</button>{/if}
    {#if can.reassign()}<button class="btn btn-primary" disabled={!chosen.length} onclick={() => (reassign = true)}><Icon name="swap" size={14} />Reassign selected ({chosen.length})</button>{/if}
  {/snippet}
</PageHead>

<div class="kpis">
  <Kpi label="Active assignments" value={n(t.active)} sub="unique DIDs on agents" icon="ok" tone="ok" onclick={() => (status = 'active')} />
  <Kpi label="Available pool" value={n(t.pool)} sub="ready for FIFO allocation" icon="pool" tone="info" onclick={() => (status = 'pool')} />
  <Kpi label="Inactive" value={n(t.inactive)} sub="not in service" icon="pause" onclick={() => (status = 'inactive')} />
  <Kpi label="Duplicate DIDs" value={n(t.duplicates)} sub="{n(dupActive)} on two agents · {n(t.duplicates - dupActive)} listed twice in other lists" icon="alert" tone={dupActive ? 'bad' : 'warn'} onclick={() => { status = dupActive ? 'active' : 'all'; dupOnly = true; }} />
</div>

{#if onlyDids.length}<div class="note" style="margin-bottom:10px"><Icon name="check" size={14} /><span>Showing {onlyDids.length} DID{onlyDids.length === 1 ? '' : 's'} from the last replacement · {ago(db.lastSync)}</span><button class="btn btn-sm" onclick={() => (onlyDids = [])}>Show all</button></div>{/if}
<div class="panel panel-pad">
  <div class="bar">
    <div class="seg">{#each tabs as [k, l, c]}<button class:on={status === k} onclick={() => { status = k; selected = []; }}>{l} <span class="cnt">{n(c)}</span></button>{/each}</div>
    <div class="spacer"></div>
    <select class="select" bind:value={op} aria-label="Operator"><option value="all">All operators</option>{#each ops as o}<option value={o.key}>{o.key}</option>{/each}</select>
    <label class="tog"><span class="switch"><input type="checkbox" bind:checked={dupOnly} /><span></span></span>Duplicates only</label>
  </div>
  <div class="bar owner" role="group" aria-label="Line holder">
    <span class="muted lbl">Held by</span>
    <div class="seg">{#each [['all', 'All lines', null], ['agent', 'Agent DIDs', ownerCounts.agent], ['common', 'Common pool', ownerCounts.common]] as [k, l, c]}<button class:on={owner === k} onclick={() => { owner = k; if (k !== 'all') status = 'active'; selected = []; }}>{l}{#if c !== null} <span class="cnt">{n(c)}</span>{/if}</button>{/each}</div>
  </div>
  <DataTable id="inventory" placeholder="DID, agent, number…" {rows} {columns} pageSize={12} rowKey={key} selectable={status === 'active'} bind:selected canSelect={(r) => r.status === 'active' && !isCommonPool(r)} onrow={(r) => (passport = r.did)}>
    {#snippet cell(r, c)}
      {#if c.key === 'status'}<Badge status={r.status} label={r.status === 'pool' ? 'Available' : undefined} />
      {:else if c.key === 'operator'}<OpChip name={r.operator} />
      {:else if c.key === 'agent'}{#if isCommonPool(r)}<span class="badge">Common pool</span>{:else if r.agent}<Person name={r.agent} size={22} onclick={(e) => { e.stopPropagation(); go('command', 'agent', { n: r.agent_number }); }} />{:else}<span class="faint">Unassigned</span>{/if}
      {:else if c.key === 'when'}{#if r.fifo}<span class="badge info">FIFO #{r.fifo}</span>{:else if r.status === 'active' && sinceMap.get(String(r.did))}<span class="muted">{ago(sinceMap.get(String(r.did)))}</span>{:else}—{/if}
      {:else if c.key === 'duplicate'}{#if r.duplicate}<Badge status="critical" label="Duplicate" />{:else}<span class="ok-t"><Icon name="check" size={13} />OK</span>{/if}
      {/if}
    {/snippet}
  </DataTable>
</div>

<ReassignModal open={reassign} items={chosen} onclose={() => { reassign = false; selected = []; }} />
<DidPassport did={passport} onclose={() => (passport = null)} />

<style>
  .owner { margin-top: -2px; } .owner .lbl { font-size: 12px; font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .cnt { font-size: 11px; opacity: .7; margin-left: 3px; font-variant-numeric: tabular-nums; }
  .sw { width: 230px; }
  .opchips { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
  .opchips button { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; font-weight: 600; font-size: 12px; color: var(--ink-2); }
  .opchips button:hover { background: #f4f5f8; }
  .opchips button.on { background: #141a26; color: #fff; }
  .opchips i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .tog { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 550; color: var(--ink-2); }
  .ok-t { display: inline-flex; gap: 4px; align-items: center; color: var(--ok); font-weight: 600; font-size: 12px; }
  @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sw { width: 100%; } }
</style>
