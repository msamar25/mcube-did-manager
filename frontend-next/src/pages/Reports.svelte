<script>
  import { db } from '../lib/store.svelte.js';
  import { route, go } from '../lib/router.svelte.js';
  import { ist, n, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import DataTable from '../components/DataTable.svelte';
  import OpChip from '../components/OpChip.svelte';
  import { toast } from '../components/Toast.svelte';

  let page = $derived(route.page);
  // audit log filters
  let ev = $state('all'), result = $state('all'), q = $state(''), from = $state(''), to = $state('');
  const events = [...new Set(db.logs.map((l) => l.event))].sort();
  let logs = $derived(db.logs.filter((l) => (ev === 'all' || l.event === ev) && (result === 'all' || l.result === result) && (!from || l.time_utc.slice(0, 10) >= from) && (!to || l.time_utc.slice(0, 10) <= to) && `${l.batch_id} ${l.old_did} ${l.new_did} ${l.agent_name} ${l.agent_number}`.toLowerCase().includes(q.trim().toLowerCase())));
  const logCols = [{ key: 'time_utc', label: 'Time (IST)', format: (v) => ist(v) }, { key: 'batch_id', label: 'Batch', mono: true }, { key: 'event', label: 'Event', custom: true }, { key: 'agent_name', label: 'Agent', strong: true }, { key: 'old_did', label: 'Old DID', mono: true }, { key: 'new_did', label: 'New DID', mono: true }, { key: 'result', label: 'Result', custom: true }, { key: 'details', label: 'Details' }];
  // history
  let hq = $state('');
  let hist = $derived(db.history.filter((h) => `${h.agent_name} ${h.agent_number} ${h.old_did} ${h.new_did} ${h.manager_at_sync}`.toLowerCase().includes(hq.trim().toLowerCase())));
  const histCols = [{ key: 'completed_at_ist', label: 'Completed (IST)', format: (v) => ist(v) }, { key: 'agent_name', label: 'Agent', strong: true }, { key: 'agent_number', label: 'Number', mono: true }, { key: 'operator', label: 'Operator', custom: true }, { key: 'old_did', label: 'Old DID', mono: true }, { key: 'new_did', label: 'New DID', mono: true }, { key: 'team_lead_at_sync', label: 'Team lead' }, { key: 'batch_id', label: 'Batch', mono: true }];
  const EXPORTS = [
    { title: 'DID inventory', sub: 'Active, pool and inactive snapshot', rows: () => db.inventory, file: 'did-inventory.csv', icon: 'list' },
    { title: 'FIFO pool order', sub: 'Current DID_Pool_FIFO', rows: () => db.inventory.filter((i) => i.status === 'pool'), file: 'did-pool-fifo.csv', icon: 'pool' },
    { title: 'Support requests', sub: 'All tickets with channel and status', rows: () => db.requests.map(({ source_counts, ...r }) => r), file: 'support-requests.csv', icon: 'inbox' },
    { title: 'Change_Logs audit', sub: 'Every reassignment stage', rows: () => db.logs, file: 'change-logs.csv', icon: 'log' },
    { title: 'Replacement history', sub: 'Verified completions', rows: () => db.history, file: 'replacement-history.csv', icon: 'history' },
    { title: 'Access log', sub: 'Sign-ins and privileged actions', rows: () => db.accessLog, file: 'access-log.csv', icon: 'shieldok' }
  ];
</script>

{#if page === 'audit'}
  <PageHead title="Audit Log" sub="Append-only Change_Logs journal — every stage of every reassignment" eyebrow="Reports">
    {#snippet actions()}<button class="btn btn-primary" onclick={() => downloadCsv(logs, 'change-logs.csv')}><Icon name="download" size={14} />Export {n(logs.length)} rows</button>{/snippet}
  </PageHead>
  <div class="sum">
    {#each [['all', 'All events', db.logs.length, '#141a26'], ['REASSIGNMENT_COMPLETE', 'Completed', db.logs.filter((l) => l.event === 'REASSIGNMENT_COMPLETE').length, 'var(--ok)'], ['BATCH_REQUESTED', 'Batches', db.logs.filter((l) => l.event === 'BATCH_REQUESTED').length, 'var(--info)'], ['DEACTIVATION_FAILED', 'Failures', db.logs.filter((l) => l.result === 'FAILED').length, 'var(--bad)']] as [k, l, c, col]}
      <button class="panel sc" class:on={ev === k || (k === 'DEACTIVATION_FAILED' && result === 'FAILED')} style="--c:{col}" onclick={() => { if (k === 'DEACTIVATION_FAILED') { ev = 'all'; result = 'FAILED'; } else { ev = k; result = 'all'; } }}><small>{l}</small><b class="tnum">{n(c)}</b></button>
    {/each}
  </div>
  <div class="panel panel-pad">
    <div class="bar">
      <select class="select" bind:value={ev} aria-label="Event"><option value="all">All events</option>{#each events as e}<option value={e}>{e}</option>{/each}</select>
      <select class="select" bind:value={result} aria-label="Result"><option value="all">All results</option>{#each ['SUCCESS', 'STARTED', 'FAILED'] as r}<option value={r}>{r}</option>{/each}</select>
      <label class="dt">From<input class="input" type="date" bind:value={from} /></label>
      <label class="dt">To<input class="input" type="date" bind:value={to} /></label>
      <div class="spacer"></div>
      <div class="search sw"><Icon name="search" size={14} /><input class="input" placeholder="Batch, DID or agent" bind:value={q} /></div>
    </div>
    <DataTable rows={logs} columns={logCols} pageSize={14} dense>
      {#snippet cell(r, c)}
        {#if c.key === 'event'}<span class="ev" class:ok={r.event === 'REASSIGNMENT_COMPLETE'} class:bad={r.result === 'FAILED'}>{r.event}</span>
        {:else if c.key === 'result'}<Badge status={r.result === 'SUCCESS' ? 'ok' : r.result === 'FAILED' ? 'bad' : 'info'} label={r.result} />{/if}
      {/snippet}
    </DataTable>
  </div>
{:else if page === 'history'}
  <PageHead title="Replacement History" sub="Verified completions from Agent_Replacement_History" eyebrow="Reports">
    {#snippet actions()}<div class="search sw"><Icon name="search" size={14} /><input class="input" placeholder="Agent, DID or manager" bind:value={hq} /></div><button class="btn btn-primary" onclick={() => downloadCsv(hist, 'replacement-history.csv')}><Icon name="download" size={14} />Export</button>{/snippet}
  </PageHead>
  <div class="panel panel-pad">
    <DataTable rows={hist} columns={histCols} pageSize={15} dense onrow={(r) => go('command', 'agent', { n: r.agent_number })}>
      {#snippet cell(r)}<OpChip name={r.operator} />{/snippet}
    </DataTable>
  </div>
{:else}
  <PageHead title="Exports" sub="Download CSV snapshots. Values starting with = + - @ are escaped for spreadsheet safety." eyebrow="Reports" />
  <div class="ex">
    {#each EXPORTS as x}
      <div class="panel panel-pad card">
        <span class="ic"><Icon name={x.icon} size={18} /></span>
        <div><b>{x.title}</b><small>{x.sub}</small></div>
        <span class="muted tnum">{n(x.rows().length)} rows</span>
        <button class="btn btn-sm" onclick={() => { downloadCsv(x.rows(), x.file); toast(`${x.file} downloaded`); }}><Icon name="download" size={13} />CSV</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .sw { width: 240px; }
  .sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .sc { display: grid; gap: 2px; text-align: left; padding: 12px 14px; border-left: 3px solid var(--c); font: inherit; color: inherit; cursor: pointer; }
  .sc small { color: var(--muted); font-size: 11.5px; font-weight: 550; } .sc b { font-size: 20px; font-weight: 750; letter-spacing: -.02em; }
  .sc.on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 30%, transparent), var(--shadow-sm); }
  @media (max-width: 700px) { .sum { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .dt { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); } .dt .input { width: 140px; }
  .ev { font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--ink-2); } .ev.ok { color: var(--ok); font-weight: 600; } .ev.bad { color: var(--bad); font-weight: 600; }
  .ex { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .card { display: grid; grid-template-columns: 40px 1fr auto auto; gap: 12px; align-items: center; }
  .card div { display: grid; } .card small { color: var(--muted); font-size: 11.5px; }
  .ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--brand-50); color: var(--brand-600); }
  @media (max-width: 1100px) { .ex { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .ex { grid-template-columns: minmax(0, 1fr); } .sw { width: 100%; } }
</style>
