<script>
  import { can } from '../lib/session.svelte.js';
  import { db, flowCounts } from '../lib/store.svelte.js';
  import { go, route } from '../lib/router.svelte.js';
  import { TICKET_ZONES } from '../lib/support.js';
  import { syncCalls, runReminders } from '../lib/data/source.js';
  import { refresh } from '../lib/store.svelte.js';
  import { isYes } from '../lib/calc.js';
  import { ago, ist, n, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import DataTable from '../components/DataTable.svelte';
  import TicketDrawer from '../components/TicketDrawer.svelte';
  import ImportRequests from '../components/ImportRequests.svelte';
  import { toast } from '../components/Toast.svelte';

  let flow = $derived(flowCounts());
  let status = $state(route.params.status || 'open'), source = $state('all'), ticket = $state(null);
  const OPEN = ['pending', 'approved', 'processing', 'review_required', 'needs_reconciliation'];
  const INCOMING = TICKET_ZONES.incoming.statuses; // not yet picked up: pending, approved, review_required
  let rows = $derived(db.requests.filter((r) => (status === 'all' || (status === 'open' ? OPEN.includes(r.status) : status === 'incoming' ? INCOMING.includes(r.status) : r.status === status)) && (source === 'all' || r.request_source === source || (r.request_source === 'both' && (source === 'call' || source === 'form')))));
  // open a ticket from a link (#/requests/queue?id=…)
  $effect(() => { if (route.params.id && !ticket) ticket = db.requests.find((r) => r.request_id === route.params.id) || null; });
  const columns = [
    { key: 'ticket_no', label: 'Ticket', mono: true, strong: true, lock: true },
    { key: 'agent_name', label: 'Agent', custom: true, minWidth: '190px', search: (r) => `${r.agent_name} ${r.agent_number}` },
    { key: 'agent_number', label: 'Agent number', mono: true },
    { key: 'current_did', label: 'DID', mono: true },
    { key: 'operator', label: 'Operator', custom: true },
    { key: 'request_source', label: 'Channel', custom: true },
    { key: 'total_interactions', label: 'Touches', num: true },
    { key: 'status', label: 'Status', custom: true, search: (r) => String(r.status).replace(/_/g, ' ') },
    { key: 'first_call_utc', label: 'Opened', custom: true },
    { key: 'last_activity_utc', label: 'Last activity', custom: true }
  ];
  const sources = { call: 'Call', form: 'Form', both: 'Call + Form', import: 'Imported', unknown: 'Unknown' };
  let busy = $state(''), importOpen = $state(false);
  async function run(name, fn, ok) { busy = name; try { toast(ok(await fn())); await refresh(); } catch (e) { toast(e.message, 'bad'); } finally { busy = ''; } }
</script>

<PageHead title="Support Requests" eyebrow="Support">
  {#snippet actions()}
    {#if can.reassign()}<button class="btn" onclick={() => (importOpen = true)}><Icon name="plus" size={14} />Import requests</button>{/if}
    <button class="btn" disabled={busy} onclick={() => run('calls', syncCalls, (r) => `Calls synced · ${r.created ?? 0} new, ${r.repeated ?? 0} repeat${r.fetched !== undefined ? ` (${r.fetched} calls read)` : ''}`)}><Icon name="refresh" size={14} />{busy === 'calls' ? 'Syncing…' : 'Sync calls'}</button>
    <button class="btn" disabled={busy} onclick={() => run('rem', runReminders, (r) => `Reminders run · ${r.processed ?? 0} checked, ${r.submitted ?? 0} called`)}><Icon name="bell" size={14} />{busy === 'rem' ? 'Running…' : 'Run reminders'}</button>
    {#if can.reports()}<button class="btn" onclick={() => downloadCsv(rows.map(({ source_counts, ...r }) => r), 'support-requests.csv')}><Icon name="download" size={14} />Export</button>{/if}
  {/snippet}
</PageHead>

<div class="kpis">
  <Kpi label="Pending" value={n(flow.pending)} icon="clock" tone="warn" onclick={() => (status = 'pending')} />
  <Kpi label="Needs review" value={n(flow.review_required)} icon="eye" tone="brand" onclick={() => (status = 'review_required')} />
  <Kpi label="Processing" value={n(flow.processing)} icon="refresh" tone="info" onclick={() => (status = 'processing')} />
  <Kpi label="Completed" value={n(flow.completed)} icon="ok" tone="ok" onclick={() => (status = 'completed')} />
  <Kpi label="Failed" value={n(flow.failed)} icon="alert" tone="bad" onclick={() => (status = 'failed')} />
</div>

<div class="panel panel-pad">
  <div class="bar">
    <div class="seg">{#each [['open', 'Open'], ['incoming', 'Incoming'], ['processing', 'In progress'], ['all', 'All'], ['completed', 'Completed'], ['failed', 'Failed'], ['rejected', 'Rejected']] as [k, l]}<button class:on={status === k} onclick={() => (status = k)}>{l}</button>{/each}</div>
    <select class="select" bind:value={source} aria-label="Channel"><option value="all">All channels</option><option value="call">Call</option><option value="form">Form</option><option value="both">Call + Form</option><option value="import">Imported</option></select>
  </div>
  <DataTable id="requests" placeholder="Ticket, agent, number or DID" {rows} {columns} pageSize={12} rowKey={(r) => r.request_id} onrow={(r) => (ticket = r)}>
    {#snippet cell(r, c)}
      {#if c.key === 'agent_name'}<Person name={r.agent_name} sub={r.agent_number} size={24} onclick={(e) => { e.stopPropagation(); go('command', 'agent', { n: r.agent_number }); }} />
      {:else if c.key === 'operator'}<OpChip name={r.operator} />
      {:else if c.key === 'request_source'}<span class="ch {r.request_source}">{#if r.request_source === 'import'}<Icon name="plus" size={12} />{:else}{#if r.request_source !== 'form'}<Icon name="phone" size={12} />{/if}{#if r.request_source !== 'call'}<Icon name="form" size={12} />{/if}{/if}{sources[r.request_source] || '—'}</span>
      {:else if c.key === 'status'}<Badge status={r.status} />
      {:else if c.key === 'first_call_utc'}<span title={ist(r.first_call_utc)}>{ago(r.first_call_utc)}</span>
      {:else if c.key === 'last_activity_utc'}<span class="muted">{ago(r.last_activity_utc)}</span>{/if}
    {/snippet}
  </DataTable>
</div>

<TicketDrawer {ticket} onclose={() => (ticket = null)} />
<ImportRequests open={importOpen} onclose={() => (importOpen = false)} />

<style>
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .sw { width: 260px; }
  .ch { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-2); }
  .ch.both { color: var(--brand-600); font-weight: 600; }
  @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sw { width: 100%; } }
</style>
