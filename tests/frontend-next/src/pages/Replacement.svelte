<script>
  import { isYes } from '../lib/calc.js';
  import { getRecovery } from '../lib/data/source.js';
  import { db, flowCounts, totals } from '../lib/store.svelte.js';
  import { go } from '../lib/router.svelte.js';
  import { ago, n, ist } from '../lib/format.js';
  import { session } from '../lib/session.svelte.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import DataTable from '../components/DataTable.svelte';
  import ReassignModal from '../components/ReassignModal.svelte';

  let flow = $derived(flowCounts());
  let t = $derived(totals());
  // the backend blocks every replacement while a batch is unfinished; show it here, not only as an error
  let unresolved = $state([]);
  $effect(() => { db.logs; getRecovery().then((r) => (unresolved = r.unresolved || [])).catch(() => {}); });
  let readyCount = $derived(db.requests.filter((r) => r.status === 'approved' || (r.status === 'pending' && !recentlyReplaced(r))).length);
  let reviewCount = $derived(db.requests.filter((r) => r.status === 'review_required' || (r.status === 'pending' && recentlyReplaced(r))).length);
  let tab = $state('ready'), selected = $state([]), open = $state(false);
  // The backend sets recent_warning using the configured recent_replacement_days; Sheets stores it as "yes"/"no".
  const recentlyReplaced = (r) => isYes(r.recent_warning);
  let rows = $derived(db.requests.filter((r) => tab === 'ready' ? (r.status === 'approved' || (r.status === 'pending' && !recentlyReplaced(r))) : tab === 'review' ? r.status === 'review_required' || (r.status === 'pending' && recentlyReplaced(r)) : tab === 'processing' ? r.status === 'processing' : r.status === 'failed'));
  let chosen = $derived(db.requests.filter((r) => selected.includes(r.request_id)).map((r) => ({ agent: r.agent_name, agent_number: r.agent_number, did: r.current_did, operator: r.operator })));
  let pool = $derived(db.inventory.filter((i) => i.status === 'pool').sort((a, b) => a.fifo - b.fifo));
  let lastBatch = $derived(db.logs.find((l) => l.event === 'BATCH_COMPLETE' || l.event === 'BATCH_STOPPED'));
  const columns = [
    { key: 'ticket_no', label: 'Ticket', mono: true, strong: true, lock: true },
    { key: 'agent_name', label: 'Agent', custom: true, minWidth: '190px', search: (r) => `${r.agent_name} ${r.agent_number}` },
    { key: 'current_did', label: 'Current DID', mono: true },
    { key: 'operator', label: 'Operator', custom: true },
    { key: 'request_source', label: 'Source', custom: true, search: (r) => SOURCES[r.request_source] || '' },
    { key: 'status', label: 'Status', custom: true, search: (r) => String(r.status).replace(/_/g, ' ') },
    { key: 'first_call_utc', label: 'Waiting', custom: true }
  ];
  const SOURCES = { call: 'Call', form: 'Form', both: 'Call + Form', unknown: '—' };
  const STAGES = [['Fresh inventory', 'Pull active, inactive & pool lists from MCube'], ['Deactivate', 'Release the agent\'s current DID'], ['Activate', 'Assign the next FIFO pool DID'], ['Verify', 'Re-read inventory; stop if not confirmed'], ['Record', 'Append Change_Logs + history; notify']];
</script>

<PageHead title="Replacement Queue" eyebrow="Command Center">
  {#snippet actions()}
    <button class="btn btn-primary" disabled={!chosen.length} onclick={() => (open = true)}><Icon name="swap" size={14} />Reassign selected ({chosen.length})</button>
  {/snippet}
</PageHead>

{#if unresolved.length}
  <div class="note bad" role="alert" style="margin-bottom:12px"><Icon name="alert" size={15} /><span><b>Replacements are paused.</b> {unresolved.length} batch{unresolved.length === 1 ? '' : 'es'} stopped part-way (last step: {unresolved[0].last_event}). An administrator must check the agent's DID in MCube and acknowledge it in <a href="#/settings/advanced">Settings → Advanced</a>.</span></div>
{/if}

<div class="pipe panel">
  {#each [['ready', 'Ready to replace', readyCount, 'var(--warn)', 'inbox'], ['review', 'Needs review', reviewCount, '#8b5cf6', 'eye'], ['processing', 'Processing', flow.processing, 'var(--info)', 'refresh'], ['done', 'Completed', flow.completed, 'var(--ok)', 'ok'], ['failed', 'Failed', flow.failed, 'var(--bad)', 'alert']] as [k, l, c, col, ic], i}
    <button class="st" class:on={tab === k} disabled={k === 'done'} onclick={() => { if (k !== 'done') { tab = k; selected = []; } }} style="--c:{col}">
      <span class="si"><Icon name={ic} size={15} /></span><span class="sl"><small>{l}</small><b class="tnum">{n(c)}</b></span>
    </button>
    {#if i < 4}<span class="arrow"><Icon name="right" size={14} /></span>{/if}
  {/each}
</div>

<div class="layout">
  <div class="panel panel-pad">
    <div class="bar">
      <div class="seg">
        <button class:on={tab === 'ready'} onclick={() => { tab = 'ready'; selected = []; }}>Ready <span class="c">{readyCount}</span></button>
        <button class:on={tab === 'review'} onclick={() => { tab = 'review'; selected = []; }}>Needs review <span class="c">{reviewCount}</span></button>
        <button class:on={tab === 'processing'} onclick={() => { tab = 'processing'; selected = []; }}>Processing <span class="c">{flow.processing}</span></button>
        <button class:on={tab === 'failed'} onclick={() => { tab = 'failed'; selected = []; }}>Failed <span class="c">{flow.failed}</span></button>
      </div>
      <span class="muted sm">{tab === 'ready' ? 'Oldest first. Select up to the available pool size.' : tab === 'review' ? 'Replaced within 3 days or flagged — review before reassigning.' : tab === 'failed' ? 'Batch stopped. Reconcile with MCube before retrying.' : 'Running in the single background worker.'}</span>
    </div>
    <DataTable id="replacement" placeholder="Ticket, agent, number or DID" rows={[...rows].sort((a, b) => String(a.first_call_utc).localeCompare(String(b.first_call_utc)))} {columns} pageSize={11} rowKey={(r) => r.request_id} selectable={tab === 'ready'} bind:selected canSelect={(r) => r.status === 'approved' || !recentlyReplaced(r)}>
      {#snippet cell(r, c)}
        {#if c.key === 'agent_name'}<Person name={r.agent_name} sub={r.agent_number} size={24} onclick={(e) => { e.stopPropagation(); go('command', 'agent', { n: r.agent_number }); }} />
        {:else if c.key === 'operator'}<OpChip name={r.operator} />
        {:else if c.key === 'request_source'}<span class="src">{#if r.source_counts?.call}<span title="Calls"><Icon name="phone" size={12} />{r.source_counts.call}</span>{/if}{#if r.source_counts?.form}<span title="Forms"><Icon name="form" size={12} />{r.source_counts.form}</span>{/if}{#if !r.source_counts?.call && !r.source_counts?.form}<span class="faint">—</span>{/if}</span>
        {:else if c.key === 'status'}<Badge status={r.status} />{#if recentlyReplaced(r)}<span class="warn-t" title="Replaced recently (within the configured recent-replacement window)"><Icon name="alert" size={12} /></span>{/if}
        {:else if c.key === 'first_call_utc'}<span class="muted">{ago(r.first_call_utc)}</span>{/if}
      {/snippet}
    </DataTable>
  </div>

  <aside class="side">
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Worker status</span><span class="badge ok"><span class="dot"></span>Idle</span></div>
      <div class="kv"><span>Last batch</span><b>{lastBatch ? ist(lastBatch.time_utc) : '—'}</b></div>
      <div class="kv"><span>Result</span><b>{lastBatch?.event.replace('_', ' ') || '—'}</b></div>
      <div class="kv"><span>Pool available</span><b>{n(t.pool)}</b></div>
      <div class="kv"><span>Signed in as</span><b>{session.role === 'admin' ? 'Administrator' : 'Operator'}</b></div>
    </div>
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Next FIFO DIDs</span><a class="lnk" href="#/command/pool">Pool →</a></div>
      {#each pool.slice(0, 5) as p}<div class="kv"><span class="mono">#{p.fifo} · {p.did}</span><OpChip name={p.operator} /></div>{/each}
    </div>
    <div class="panel panel-pad">
      <div class="panel-title" style="margin-bottom:10px">How each agent is processed</div>
      <ol class="stages">{#each STAGES as [s, d], i}<li><span class="n">{i + 1}</span><div><b>{s}</b><small>{d}</small></div></li>{/each}</ol>
    </div>
  </aside>
</div>

<ReassignModal {open} items={chosen} requestIds={selected} onclose={() => { open = false; selected = []; }} />

<style>
  .pipe { display: flex; align-items: center; gap: 4px; padding: 8px; margin-bottom: 12px; overflow-x: auto; }
  .pipe .st { flex: 1; min-width: 150px; display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid transparent; background: transparent; text-align: left; transition: background .15s, border-color .15s; }
  .pipe .st:not(:disabled):hover { background: #f7f8fa; }
  .pipe .st.on { background: color-mix(in srgb, var(--c) 9%, #fff); border-color: color-mix(in srgb, var(--c) 35%, #fff); }
  .pipe .st:disabled { cursor: default; opacity: 1; }
  .si { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fff); flex: none; }
  .sl { display: grid; line-height: 1.15; } .sl small { font-size: 11px; color: var(--muted); font-weight: 550; } .sl b { font-size: 19px; font-weight: 750; }
  .arrow { color: var(--faint); flex: none; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
  .bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .c { font-size: 11px; opacity: .75; margin-left: 3px; } .sm { font-size: 12px; }
  .src { display: inline-flex; gap: 8px; color: var(--ink-2); } .src span { display: inline-flex; gap: 3px; align-items: center; }
  .warn-t { color: var(--warn); margin-left: 6px; display: inline-flex; vertical-align: middle; }
  .side { display: grid; gap: 12px; }
  .kv { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 0; font-size: 12.5px; border-bottom: 1px solid var(--line-2); } .kv:last-child { border-bottom: 0; } .kv span { color: var(--muted); }
  .lnk { font-size: 12px; font-weight: 600; color: var(--brand-600); }
  .stages { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 9px; }
  .stages li { display: flex; gap: 10px; } .stages div { display: grid; font-size: 12.5px; } .stages small { color: var(--muted); font-size: 11.5px; }
  .n { width: 22px; height: 22px; border-radius: 50%; background: var(--brand-50); color: var(--brand-600); font-weight: 700; font-size: 11px; display: grid; place-items: center; flex: none; }
  @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } .side { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
</style>
