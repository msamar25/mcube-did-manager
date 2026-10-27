<script>
  import { db, opStats, totals, poolActivity, trend } from '../lib/store.svelte.js';
  import { poolChart } from '../lib/charts.js';
  import { rangePool, rangeTrend } from '../lib/range.svelte.js';
  import RangePicker from '../components/RangePicker.svelte';
  import { poolRunway } from '../lib/calc.js';
  import { ago, n, pct, downloadCsv } from '../lib/format.js';
  import { DEFAULT_RULES } from '../lib/risk.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import Icon from '../components/Icon.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Donut from '../components/charts/Donut.svelte';
  import LineChart from '../components/charts/LineChart.svelte';
  import Bars from '../components/charts/Bars.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Meter from '../components/Meter.svelte';

  let ops = $derived(opStats());
  let t = $derived(totals());
  let pool = $derived(db.inventory.filter((i) => i.status === 'pool').sort((a, b) => a.fifo - b.fifo));
  // From Change_Logs: exact replacements, and runway = pool ÷ average replacements per day over the chosen range
  let pc = $derived(poolChart(rangePool()));
  let tr = $derived(rangeTrend());
  let run = $derived(poolRunway(t.pool, tr));
  let threshold = $state(DEFAULT_RULES.minPool), op = $state('all');
  let rows = $derived(pool.filter((p) => op === 'all' || p.operator === op));
  const columns = [
    { key: 'fifo', label: 'FIFO #', num: true, custom: true },
    { key: 'did', label: 'DID', mono: true, strong: true },
    { key: 'operator', label: 'Operator', custom: true }
  ];
</script>

<PageHead title="Pool Intelligence" eyebrow="Command Center">
  {#snippet actions()}<button class="btn" onclick={() => downloadCsv(pool, 'did-pool-fifo.csv')}><Icon name="download" size={14} />Export FIFO</button>{/snippet}
</PageHead>

<div class="kpis">
  <Kpi label="Available pool" value={n(t.pool)} sub="{pct((t.pool / t.total) * 100)} of all DIDs" icon="pool" tone="info" />
  <Kpi label="Next FIFO DID" value={pool[0]?.did || '—'} sub="{pool[0]?.operator} · position 1" icon="arrow" tone="brand" />
  <Kpi label="Assigned · 24h" value={n(poolActivity().assigned24)} sub="verified replacements" icon="trend" />
  <Kpi label="Pool runway" value={run.days === null ? '—' : run.days + ' days'} sub={run.days === null ? `no replacements · ${tr.label}` : `at ${run.perDay}/day · ${tr.label}`} icon="clock" tone={run.days !== null && run.days < 7 ? 'warn' : 'ok'} />
</div>

<div class="grid">
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">Distribution by operator</span>
      <label class="thr">Low-pool threshold <input class="input" type="number" min="0" bind:value={threshold} /></label></div>
    <div class="dist">
      <Donut size={140} thickness={18} center={n(t.pool)} sub="in pool" segments={ops.map((o) => ({ label: o.key, value: o.pool, color: o.color }))} />
      <div class="dl">
        {#each ops as o}
          <div class="dr">
            <span class="op-chip"><span class="op-dot" style="background:{o.color}"></span>{o.key}</span>
            <div class="mb"><Meter value={o.pool} max={Math.max(...ops.map((x) => x.pool))} color={o.color} /></div>
            <b class="tnum">{n(o.pool)}</b>
            {#if o.pool < threshold}<span class="badge warn">Low</span>{:else}<span class="badge ok">OK</span>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">Pool activity</span><span class="legend">Pool now <b>{n(pc.poolNow)}</b></span></div>
    <RangePicker />
    <Bars labels={pc.labels} values={pc.series[0].values} height={200} label="Verified replacements from the pool" unit=" assigned" />
    <p class="cnote">{pc.note}</p>
  </div>
  <div class="panel panel-pad fifo">
    <div class="panel-head"><span class="panel-title">FIFO queue</span>
      <select class="select" bind:value={op} aria-label="Operator"><option value="all">All operators</option>{#each ops as o}<option value={o.key}>{o.key}</option>{/each}</select></div>
    <DataTable id="pool" {rows} {columns} pageSize={9} dense rowKey={(r) => r.did}>
      {#snippet cell(r, c)}
        {#if c.key === 'fifo'}{#if r.fifo === 1}<span class="badge pending">Next</span>{:else}<span class="tnum">{r.fifo}</span>{/if}
        {:else if c.key === 'operator'}<OpChip name={r.operator} />
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>

<style>
  .cnote { margin: 4px 0 0; font-size: 10.5px; color: var(--faint); } .legend b { color: var(--ink); }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
  .dist { display: flex; gap: 16px; align-items: center; margin-bottom: 10px; }
  .dl { flex: 1; display: grid; gap: 10px; }
  .dr { display: grid; grid-template-columns: 84px 1fr 34px 42px; gap: 8px; align-items: center; font-size: 12.5px; }
  .dr b { text-align: right; }
  .thr { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); } .thr .input { width: 64px; height: 28px; }
  .legend { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); } .legend i { width: 7px; height: 7px; border-radius: 50%; margin-left: 6px; }
  .fifo .select { height: 28px; }
  @media (max-width: 1300px) { .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .fifo { grid-column: 1 / -1; } }
  @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid { grid-template-columns: minmax(0, 1fr); } .dist { flex-direction: column; align-items: stretch; } .dist :global(.donut) { align-self: center; } }
</style>
