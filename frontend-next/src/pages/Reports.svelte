<script>
  import { can } from '../lib/session.svelte.js';
  import { db } from '../lib/store.svelte.js';
  import { route, go } from '../lib/router.svelte.js';
  import { ist, n, downloadCsv } from '../lib/format.js';
  import { parseTs } from '../lib/calc.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import DataTable from '../components/DataTable.svelte';
  import OpChip from '../components/OpChip.svelte';
  import { toast } from '../components/Toast.svelte';

  let page = $derived(route.page);
  // audit log filters
  let ev = $state('all'), result = $state('all'), from = $state(''), to = $state('');
  // calendar day in IST, so the date filter matches what people see
  const istDay = (v) => { const t = parseTs(v); return t === t && t ? new Date(t + 330 * 60e3).toISOString().slice(0, 10) : ''; };
  let events = $derived([...new Set(db.logs.map((l) => l.event))].sort());
  let results = $derived([...new Set(db.logs.map((l) => l.result).filter(Boolean))].sort());
  let logs = $derived(db.logs.filter((l) => (ev === 'all' || l.event === ev) && (result === 'all' || l.result === result) && (!from || istDay(l.time_utc) >= from) && (!to || istDay(l.time_utc) <= to)));
  const logCols = [{ key: 'time_utc', label: 'Time (IST)', format: (v) => ist(v), search: (r) => ist(r.time_utc) }, { key: 'batch_id', label: 'Batch', mono: true }, { key: 'event', label: 'Event', custom: true }, { key: 'agent_name', label: 'Agent', strong: true }, { key: 'old_did', label: 'Old DID', mono: true }, { key: 'new_did', label: 'New DID', mono: true }, { key: 'result', label: 'Result', custom: true }, { key: 'details', label: 'Details' }];
  // history
  let hist = $derived(db.history);
  const histCols = [{ key: 'completed_at_ist', label: 'Completed (IST)', format: (v) => ist(v) }, { key: 'agent_name', label: 'Agent', strong: true }, { key: 'agent_number', label: 'Number', mono: true }, { key: 'operator', label: 'Operator', custom: true }, { key: 'old_did', label: 'Old DID', mono: true }, { key: 'new_did', label: 'New DID', mono: true }, { key: 'team_lead_at_sync', label: 'Team lead' }, { key: 'batch_id', label: 'Batch', mono: true }];
</script>

{#if page === 'audit'}
  <PageHead title="Audit Log" eyebrow="Reports">
    {#snippet actions()}{#if can.reports()}<button class="btn btn-primary" onclick={() => downloadCsv(logs, 'change-logs.csv')}><Icon name="download" size={14} />Export {n(logs.length)} rows</button>{/if}{/snippet}
  </PageHead>
  <div class="sum">
    {#each [['all', 'All events', db.logs.length, '#141a26'], ['REASSIGNMENT_COMPLETE', 'Completed', db.logs.filter((l) => l.event === 'REASSIGNMENT_COMPLETE').length, 'var(--ok)'], ['BATCH_REQUESTED', 'Batches', db.logs.filter((l) => l.event === 'BATCH_REQUESTED').length, 'var(--info)'], ['DEACTIVATION_FAILED', 'Failures', db.logs.filter((l) => l.result === 'FAILED').length, 'var(--bad)']] as [k, l, c, col]}
      <button class="panel sc" class:on={ev === k || (k === 'DEACTIVATION_FAILED' && result === 'FAILED')} style="--c:{col}" onclick={() => { if (k === 'DEACTIVATION_FAILED') { ev = 'all'; result = 'FAILED'; } else { ev = k; result = 'all'; } }}><small>{l}</small><b class="tnum">{n(c)}</b></button>
    {/each}
  </div>
  <div class="panel panel-pad">
    <div class="bar">
      <select class="select" bind:value={ev} aria-label="Event"><option value="all">All events</option>{#each events as e}<option value={e}>{e}</option>{/each}</select>
      <select class="select" bind:value={result} aria-label="Result"><option value="all">All results</option>{#each results as r}<option value={r}>{r}</option>{/each}</select>
      <label class="dt">From<input class="input" type="date" bind:value={from} /></label>
      <label class="dt">To<input class="input" type="date" bind:value={to} /></label>
    </div>
    <DataTable id="audit" placeholder="Batch, DID or agent" rows={logs} columns={logCols} pageSize={14} dense>
      {#snippet cell(r, c)}
        {#if c.key === 'event'}<span class="ev" class:ok={r.event === 'REASSIGNMENT_COMPLETE'} class:bad={r.result === 'FAILED'}>{r.event}</span>
        {:else if c.key === 'result'}<Badge status={r.result === 'SUCCESS' ? 'ok' : r.result === 'FAILED' ? 'bad' : 'info'} label={r.result} />{/if}
      {/snippet}
    </DataTable>
  </div>
{:else if page === 'history'}
  <PageHead title="Replacement History" eyebrow="Reports">
    {#snippet actions()}{#if can.reports()}<button class="btn btn-primary" onclick={() => downloadCsv(hist, 'replacement-history.csv')}><Icon name="download" size={14} />Export</button>{/if}{/snippet}
  </PageHead>
  <div class="panel panel-pad">
    <DataTable id="history" placeholder="Agent, DID or manager" rows={hist} columns={histCols} pageSize={15} dense onrow={(r) => go('command', 'agent', { n: r.agent_number })}>
      {#snippet cell(r)}<OpChip name={r.operator} />{/snippet}
    </DataTable>
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
