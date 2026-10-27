<script>
  import { can } from '../lib/session.svelte.js';
  import { db } from '../lib/store.svelte.js';
  import { range, bounds } from '../lib/range.svelte.js';
  import { perBucket } from '../lib/calc.js';
  import RangePicker from '../components/RangePicker.svelte';
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
  // requests per day (or hour) in the chosen range, from each request's first call
  let days = $derived((range.preset, range.from, range.to, perBucket(db.requests, (r) => r.first_call_utc, bounds())));
  let b = $derived((range.preset, range.from, range.to, bounds()));
  const STATUS = [['completed', 'Completed', '#12a150'], ['pending', 'Pending', '#e08600'], ['processing', 'Processing', '#2a6fdb'], ['review_required', 'Review', '#8b5cf6'], ['approved', 'Approved', '#0ea5e9'], ['failed', 'Failed', '#d92d20']];
  const channels = ['call', 'form', 'both'].map((c) => ({ label: c === 'both' ? 'Call + Form' : c === 'call' ? 'Call' : 'Form', value: db.requests.filter((r) => r.request_source === c).length, color: c === 'call' ? '#2a6fdb' : c === 'form' ? '#f26b1d' : '#8b5cf6' }));
  let agents = $derived(ins.agents);
  const columns = [{ key: 'agent_name', label: 'Agent', custom: true, minWidth: '180px', search: (r) => `${r.agent_name} ${r.agent_number}` }, { key: 'team_lead', label: 'Team lead' }, { key: 'manager', label: 'Manager' }, { key: 'requests', label: 'Requests', num: true }, { key: 'calls', label: 'Calls', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'repeat_requests', label: 'Repeat', num: true }];
</script>

<PageHead title="Request Insights" eyebrow="Analytics">
  {#snippet actions()}{#if can.reports()}<button class="btn" onclick={() => downloadCsv(ins.agents, 'agent-request-insights.csv')}><Icon name="download" size={14} />Export</button>{/if}{/snippet}
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
    <div class="panel-head"><span class="panel-title">Requests · {b.label}</span></div>
    <RangePicker />
    <LineChart labels={days.map((d) => (b.hourly ? `${String(d.hour).padStart(2, '0')}:00` : new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })))} area height={180} label="Requests per day" series={[{ name: 'Requests', color: '#f26b1d', values: days.map((d) => d.count) }]} />
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
  <div class="panel-head"><span class="panel-title">Agents by request volume</span></div>
  <DataTable id="insights-agents" placeholder="Agent, team lead or manager" rows={agents} {columns} pageSize={8} dense onrow={(r) => go('command', 'agent', { n: r.agent_number })}>
    {#snippet cell(r)}<Person name={r.agent_name} sub={r.agent_number} size={22} />{/snippet}
  </DataTable>
</div>

<style>
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, .9fr); gap: 12px; margin-bottom: 12px; }
  .ch { display: flex; gap: 14px; align-items: center; } .cl { display: grid; gap: 8px; flex: 1; font-size: 12px; }
  .cl div { display: flex; gap: 7px; align-items: center; } .cl i { width: 8px; height: 8px; border-radius: 50%; } .cl b { margin-left: auto; }
  @media (max-width: 1200px) { .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .wide { grid-column: 1 / -1; } .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .grid { grid-template-columns: minmax(0, 1fr); } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
