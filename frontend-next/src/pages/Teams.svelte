<script>
  import { db } from '../lib/store.svelte.js';
  import { n, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Meter from '../components/Meter.svelte';

  const teams = db.insights.teams.map((t) => ({ ...t, rate: t.requests ? Math.round((t.completed / t.requests) * 100) : 0 }));
  const managers = [...new Set(teams.map((t) => t.manager))].map((m) => { const rows = teams.filter((t) => t.manager === m); return { manager: m, teams: rows.length, agents: rows.reduce((s, r) => s + r.agents, 0), requests: rows.reduce((s, r) => s + r.requests, 0), completed: rows.reduce((s, r) => s + r.completed, 0) }; }).sort((a, b) => b.requests - a.requests);
  const max = Math.max(...managers.map((m) => m.requests));
  let mgr = $state('all');
  let rows = $derived(teams.filter((t) => mgr === 'all' || t.manager === mgr));
  const columns = [{ key: 'team_lead', label: 'Team lead', strong: true }, { key: 'manager', label: 'Manager' }, { key: 'agents', label: 'Agents w/ requests', num: true }, { key: 'requests', label: 'Requests', num: true }, { key: 'calls', label: 'Calls', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'rate', label: 'Completion', num: true, custom: true }];
</script>
<PageHead title="Team Performance" eyebrow="Analytics">
  {#snippet actions()}<button class="btn" onclick={() => downloadCsv(teams, 'team-performance.csv')}><Icon name="download" size={14} />Export</button>{/snippet}
</PageHead>
<div class="layout">
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">By manager</span></div>
    <div class="mg">
      <button class="m" class:on={mgr === 'all'} onclick={() => (mgr = 'all')}><span>All managers</span><b>{n(teams.reduce((s, t) => s + t.requests, 0))}</b></button>
      {#each managers as m}
        <button class="m" class:on={mgr === m.manager} onclick={() => (mgr = m.manager)}><span>{m.manager}<small>{m.teams} teams · {m.agents} agents</small></span><b>{n(m.requests)}</b><div class="mb"><Meter value={m.requests} {max} /></div></button>
      {/each}
    </div>
  </div>
  <div class="panel panel-pad">
    <DataTable id="teams" {rows} {columns} pageSize={14}>
      {#snippet cell(r)}<div class="rt"><Meter value={r.rate} color="var(--ok)" /><b>{r.rate}%</b></div>{/snippet}
    </DataTable>
  </div>
</div>
<style>
  .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; align-items: start; }
  .mg { display: grid; gap: 6px; }
  .m { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; text-align: left; padding: 9px 10px; border-radius: 11px; border: 1px solid var(--line-2); background: #fcfcfd; }
  .m.on { border-color: #f8c9a8; background: var(--brand-50); }
  .m span { display: grid; font-weight: 600; font-size: 12.5px; } .m small { color: var(--muted); font-weight: 400; font-size: 11px; } .m b { font-variant-numeric: tabular-nums; }
  .mb { grid-column: 1 / -1; }
  .rt { display: grid; grid-template-columns: 70px 36px; gap: 6px; align-items: center; justify-content: end; }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
