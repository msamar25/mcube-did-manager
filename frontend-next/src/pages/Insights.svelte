<script>
  import { db } from '../lib/store.svelte.js';
  import { go } from '../lib/router.svelte.js';
  import { n, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import Icon from '../components/Icon.svelte';
  import BarChart from '../components/charts/BarChart.svelte';
  import LineChart from '../components/charts/LineChart.svelte';
  import Donut from '../components/charts/Donut.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Person from '../components/Person.svelte';

  const ins = db.insights, s = ins.summary;
  const days = ins.by_day.slice(-21);
  const STATUS = [['completed', 'Completed', '#12a150'], ['pending', 'Pending', '#e08600'], ['processing', 'Processing', '#2a6fdb'], ['review_required', 'Review', '#8b5cf6'], ['approved', 'Approved', '#0ea5e9'], ['failed', 'Failed', '#d92d20']];
  const channels = ['call', 'form', 'both'].map((c) => ({ label: c === 'both' ? 'Call + Form' : c === 'call' ? 'Call' : 'Form', value: db.requests.filter((r) => r.request_source === c).length, color: c === 'call' ? '#2a6fdb' : c === 'form' ? '#f26b1d' : '#8b5cf6' }));
  let q = $state('');
  let agents = $derived(ins.agents.filter((a) => `${a.agent_name} ${a.agent_number} ${a.manager} ${a.team_lead}`.toLowerCase().includes(q.trim().toLowerCase())));
  const columns = [{ key: 'agent_name', label: 'Agent', custom: true }, { key: 'team_lead', label: 'Team lead' }, { key: 'manager', label: 'Manager' }, { key: 'requests', label: 'Requests', num: true }, { key: 'calls', label: 'Calls', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'repeat_requests', label: 'Repeat', num: true }];
</script>

<PageHead title="Request Insights" sub="Read-only QC metrics from Pending_Requests, call events and Change_Logs" eyebrow="Analytics">
  {#snippet actions()}<button class="btn" onclick={() => downloadCsv(ins.agents, 'agent-request-insights.csv')}><Icon name="download" size={14} />Export</button>{/snippet}
</PageHead>

<div class="kpis">
  <Kpi label="Requests" value={n(s.requests)} sub="{n(s.call_events)} call events" icon="inbox" tone="brand" />
  <Kpi label="Verified replacements" value={n(s.replacement_completions)} sub="verified in Change_Logs" icon="ok" tone="ok" />
  <Kpi label="Median turnaround" value="{s.median_turnaround_hours ?? '—'} h" sub="avg {s.average_turnaround_hours ?? '—'} h · n={s.turnaround_sample_size}" icon="clock" tone="info" />
  <Kpi label="Repeat requesters" value={n(s.repeat_requests)} sub="agents with >1 request" icon="users" tone="warn" />
  <Kpi label="Employees" value={n(s.employees)} sub="Employee_Directory" icon="agent" />
</div>

<div class="grid">
  <div class="panel panel-pad wide">
    <div class="panel-head"><span class="panel-title">Requests per day · last {days.length} days</span></div>
    <LineChart labels={days.map((d) => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))} area height={180} label="Requests per day" series={[{ name: 'Requests', color: '#f26b1d', values: days.map((d) => d.requests) }]} />
  </div>
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">Status mix</span></div>
    <BarChart height={180} label="Requests by status" data={STATUS.map(([k, l, c]) => ({ label: l, value: ins.statuses[k] || 0, color: c }))} />
  </div>
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">Channel</span></div>
    <div class="ch"><Donut size={130} thickness={17} center={n(db.requests.length)} sub="requests" segments={channels} />
      <div class="cl">{#each channels as c}<div><i style="background:{c.color}"></i>{c.label}<b>{n(c.value)}</b></div>{/each}</div></div>
  </div>
</div>

<div class="panel panel-pad">
  <div class="panel-head"><span class="panel-title">Agents by request volume</span><div class="search"><Icon name="search" size={14} /><input class="input" placeholder="Agent, team lead or manager" bind:value={q} /></div></div>
  <DataTable rows={agents} {columns} pageSize={8} dense onrow={(r) => go('command', 'agent', { n: r.agent_number })}>
    {#snippet cell(r)}<Person name={r.agent_name} sub={r.agent_number} size={22} />{/snippet}
  </DataTable>
  <div class="note" style="margin-top:8px"><Icon name="info" size={14} />Team and manager come from the current Employee_Directory (role4/role5), not the hierarchy at the time of each request.</div>
</div>

<style>
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, .9fr); gap: 12px; margin-bottom: 12px; }
  .ch { display: flex; gap: 14px; align-items: center; } .cl { display: grid; gap: 8px; flex: 1; font-size: 12px; }
  .cl div { display: flex; gap: 7px; align-items: center; } .cl i { width: 8px; height: 8px; border-radius: 50%; } .cl b { margin-left: auto; }
  @media (max-width: 1200px) { .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .wide { grid-column: 1 / -1; } .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .grid { grid-template-columns: minmax(0, 1fr); } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
