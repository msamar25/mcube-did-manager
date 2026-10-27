<script>
  import { db, flowCounts } from '../lib/store.svelte.js';
  import { go, route } from '../lib/router.svelte.js';
  import { TICKET_ZONES } from '../lib/support.js';
  import { getRequestTimeline, syncCalls, runReminders, reviewRequest } from '../lib/data/source.js';
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
  import Drawer from '../components/Drawer.svelte';
  import { toast } from '../components/Toast.svelte';

  let flow = $derived(flowCounts());
  let status = $state(route.params.status || 'open'), source = $state('all'), ticket = $state(null), tl = $state(null), reason = $state('Reviewed previous replacement');
  const OPEN = ['pending', 'approved', 'processing', 'review_required', 'needs_reconciliation'];
  const INCOMING = TICKET_ZONES.incoming.statuses; // not yet picked up: pending, approved, review_required
  let rows = $derived(db.requests.filter((r) => (status === 'all' || (status === 'open' ? OPEN.includes(r.status) : status === 'incoming' ? INCOMING.includes(r.status) : r.status === status)) && (source === 'all' || r.request_source === source || r.request_source === 'both' && source !== 'unknown')));
  $effect(() => { tl = null; if (ticket) getRequestTimeline(ticket.request_id).then((d) => (tl = d)); });
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
  const sources = { call: 'Call', form: 'Form', both: 'Call + Form', unknown: 'Unknown' };
  let busy = $state(''), reviewing = $state(false);
  async function run(name, fn, ok) { busy = name; try { toast(ok(await fn())); await refresh(); } catch (e) { toast(e.message, 'bad'); } finally { busy = ''; } }
  async function review(approved) {
    reviewing = true;
    try { await reviewRequest(ticket.request_id, approved, reason.trim()); toast(approved ? 'Approved · the request can now be queued for replacement' : 'Rejected · the request is closed'); ticket = null; await refresh(); }
    catch (e) { toast(e.message, 'bad'); } finally { reviewing = false; }
  }
</script>

<PageHead title="Support Requests" eyebrow="Support">
  {#snippet actions()}
    <button class="btn" disabled={busy} onclick={() => run('calls', syncCalls, (r) => `Calls synced · ${r.created ?? 0} new, ${r.repeated ?? 0} repeat${r.fetched !== undefined ? ` (${r.fetched} calls read)` : ''}`)}><Icon name="refresh" size={14} />{busy === 'calls' ? 'Syncing…' : 'Sync calls'}</button>
    <button class="btn" disabled={busy} onclick={() => run('rem', runReminders, (r) => `Reminders run · ${r.processed ?? 0} checked, ${r.submitted ?? 0} called`)}><Icon name="bell" size={14} />{busy === 'rem' ? 'Running…' : 'Run reminders'}</button>
    <button class="btn" onclick={() => downloadCsv(rows.map(({ source_counts, ...r }) => r), 'support-requests.csv')}><Icon name="download" size={14} />Export</button>
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
    <select class="select" bind:value={source} aria-label="Channel"><option value="all">All channels</option><option value="call">Call</option><option value="form">Form</option><option value="both">Call + Form</option></select>
  </div>
  <DataTable id="requests" placeholder="Ticket, agent, number or DID" {rows} {columns} pageSize={12} rowKey={(r) => r.request_id} onrow={(r) => (ticket = r)}>
    {#snippet cell(r, c)}
      {#if c.key === 'agent_name'}<Person name={r.agent_name} sub={r.agent_number} size={24} onclick={(e) => { e.stopPropagation(); go('command', 'agent', { n: r.agent_number }); }} />
      {:else if c.key === 'operator'}<OpChip name={r.operator} />
      {:else if c.key === 'request_source'}<span class="ch {r.request_source}">{#if r.request_source !== 'form'}<Icon name="phone" size={12} />{/if}{#if r.request_source !== 'call'}<Icon name="form" size={12} />{/if}{sources[r.request_source]}</span>
      {:else if c.key === 'status'}<Badge status={r.status} />
      {:else if c.key === 'first_call_utc'}<span title={ist(r.first_call_utc)}>{ago(r.first_call_utc)}</span>
      {:else if c.key === 'last_activity_utc'}<span class="muted">{ago(r.last_activity_utc)}</span>{/if}
    {/snippet}
  </DataTable>
</div>

<Drawer open={!!ticket} title={ticket?.ticket_no || ''} sub="{ticket?.agent_name} · {ticket?.agent_number}" onclose={() => (ticket = null)}>
  {#if ticket}
    <div class="grid2">
      <div class="kv"><small>Status</small><Badge status={ticket.status} /></div>
      <div class="kv"><small>Channel</small><b>{sources[ticket.request_source]}</b></div>
      <div class="kv"><small>Current DID</small><b class="mono">{ticket.current_did}</b></div>
      <div class="kv"><small>Operator</small><OpChip name={ticket.operator} /></div>
      <div class="kv"><small>Opened</small><b>{ist(ticket.first_call_utc)}</b></div>
      <div class="kv"><small>Reminders sent</small><b>{ticket.reminder_count}</b></div>
      {#if ticket.replacement_new_did}<div class="kv"><small>New DID</small><b class="mono">{ticket.replacement_new_did}</b></div><div class="kv"><small>Completed</small><b>{ist(ticket.completed_utc)}</b></div>{/if}
    </div>
    {#if ticket.status === 'review_required' || (ticket.status === 'pending' && isYes(ticket.recent_warning))}
      <div class="panel panel-pad rv">
        <div class="panel-title">Review required</div>
        <p class="muted">This agent was replaced recently. Record a decision before the request can be queued.</p>
        <label class="field">Reason (3–500 characters)<input class="input" bind:value={reason} maxlength="500" /></label>
        <div class="row"><button class="btn btn-primary" disabled={reviewing || reason.trim().length < 3} onclick={() => review(true)}>Approve</button><button class="btn btn-danger" disabled={reviewing || reason.trim().length < 3} onclick={() => review(false)}>Reject</button></div>
      </div>
    {/if}
    <div class="panel panel-pad">
      <div class="panel-title" style="margin-bottom:10px">Ticket timeline</div>
      {#if !tl}<div class="muted">Loading…</div>{:else}
        <div class="tl">{#each tl.events as e}<div class="ev"><span class="dot"></span><div><b>{e.event.replace(/_/g, ' ')}</b><small>{ist(e.timestamp_ist)} · {e.source} · {e.actor}</small><small>{e.details}</small></div></div>{/each}</div>
      {/if}
    </div>
    <button class="btn" onclick={() => go('command', 'agent', { n: ticket.agent_number })}><Icon name="agent" size={14} />Open Agent 360°</button>
  {/if}
</Drawer>

<style>
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .sw { width: 260px; }
  .ch { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-2); }
  .ch.both { color: var(--brand-600); font-weight: 600; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kv { display: grid; gap: 3px; background: #f8f9fb; border-radius: 10px; padding: 8px 10px; justify-items: start; } .kv small { color: var(--muted); font-size: 11px; }
  .rv { display: grid; gap: 8px; border-color: #e5d4ff; background: #faf7ff; }
  .tl { display: grid; gap: 10px; }
  .ev { display: flex; gap: 10px; } .ev div { display: grid; font-size: 12px; } .ev small { color: var(--muted); font-size: 11px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); margin-top: 4px; flex: none; box-shadow: 0 0 0 3px var(--brand-50); }
  @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sw { width: 100%; } }
</style>
