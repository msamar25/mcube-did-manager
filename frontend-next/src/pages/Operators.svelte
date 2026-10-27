<script>
  import { db, opStats, trend } from '../lib/store.svelte.js';
  import { trendChart } from '../lib/charts.js';
  import { isReplacement, isOpen } from '../lib/calc.js';
  import { route, go } from '../lib/router.svelte.js';
  import { n, pct, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Meter from '../components/Meter.svelte';
  import Spark from '../components/charts/Spark.svelte';
  import LineChart from '../components/charts/LineChart.svelte';
  import HBars from '../components/charts/HBars.svelte';
  import { logoSvg } from '../three/logos.js';

  let ops = $derived(opStats());
  let focus = $state(route.params.op || 'all');
  // verified replacements, grouped by the operator of the DID that was replaced
  let opOfDid = $derived(new Map(db.inventory.map((i) => [String(i.did), i.operator])));
  const replacements = (k) => db.logs.filter((l) => isReplacement(l) && opOfDid.get(String(l.old_did)) === k).length;
  const openReq = (k) => db.requests.filter((r) => r.operator === k && isOpen(r)).length;
  let rows = $derived(ops.map((o) => ({ ...o, replacements: replacements(o.key), open: openReq(o.key), share: (o.total / ops.reduce((s, x) => s + x.total, 0)) * 100 })));
  let shown = $derived(focus === 'all' ? rows : rows.filter((r) => r.key === focus));
  let tr = $derived(trend());
  let tc = $derived(trendChart(shown, tr));
  let totalAll = $derived(rows.reduce((s, r) => s + r.total, 0));
</script>

<PageHead title="Operator Analytics" sub="Allocation, utilization and inventory per telecom operator" eyebrow="Command Center">
  {#snippet actions()}
    <select class="select" bind:value={focus} aria-label="Operator"><option value="all">All operators</option>{#each ops as o}<option value={o.key}>{o.key}</option>{/each}</select>
    <button class="btn" onclick={() => downloadCsv(rows.map(({ key, label, total, active, pool, inactive, utilization, duplicates, replacements, open }) => ({ operator: key, label, total, active, pool, inactive, utilization, duplicates, replacements, open_requests: open })), 'operator-analytics.csv')}><Icon name="download" size={14} />Export</button>
  {/snippet}
</PageHead>

<div class="cards">
  {#each rows as o}
    <button class="opc panel" class:dim={focus !== 'all' && focus !== o.key} onclick={() => (focus = focus === o.key ? 'all' : o.key)}>
      <div class="oh">{@html logoSvg(o.key, 34)}<div><b>{o.key}</b><small>{o.family}</small></div><span class="tot tnum">{n(o.total)}<small>DIDs</small></span></div>
      <div class="ou"><span>Utilization</span><b class="tnum">{pct(o.utilization)}</b></div>
      <Meter value={o.utilization} color={o.color} height={7} />
      <div class="og">
        <div><small>Active</small><b>{n(o.active)}</b></div><div><small>Pool</small><b>{n(o.pool)}</b></div><div><small>Inactive</small><b>{n(o.inactive)}</b></div><div><small>Open req.</small><b>{n(o.open)}</b></div>
      </div>
      <div class="os"><small class="muted">7-day utilization</small><Spark values={tr.items.map((d) => d[o.key] ?? 0)} color={o.color} width={110} height={26} /></div>
    </button>
  {/each}
</div>

<div class="grid2">
  <div class="panel panel-pad">
    <div class="panel-head"><span class="panel-title">Allocation mix</span><span class="panel-sub">Share of all {n(totalAll)} DIDs</span></div>
    <div class="mix">
      {#each rows as o}<span style="flex:{o.total};background:{o.color}" title="{o.key}: {n(o.total)}"></span>{/each}
    </div>
    <div class="mixl">{#each rows as o}<span><i style="background:{o.color}"></i>{o.key}<b>{o.share.toFixed(1)}%</b></span>{/each}</div>
    <div class="table-wrap"><table class="tbl" style="margin-top:10px">
      <thead><tr><th>Operator</th><th class="num">Active</th><th class="num">Pool</th><th class="num">Inactive</th><th class="num">Util.</th><th class="num">Replaced</th><th class="num">Dup.</th></tr></thead>
      <tbody>{#each shown as o}<tr><td class="strong"><span class="op-chip"><span class="op-dot" style="background:{o.color}"></span>{o.key}</span></td><td class="num">{n(o.active)}</td><td class="num">{n(o.pool)}</td><td class="num">{n(o.inactive)}</td><td class="num">{pct(o.utilization)}</td><td class="num">{n(o.replacements)}</td><td class="num" class:bad={o.duplicates}>{n(o.duplicates)}</td></tr>{/each}</tbody>
    </table></div>
  </div>
  <div class="panel panel-pad">
    <div class="panel-head wrap"><span class="panel-title">Utilization trend · 7 days</span><span class="legend">{#each shown as o}<i style="background:{o.color}"></i>{o.key}{/each}</span></div>
    <LineChart labels={tc.labels} height={190} yMin={tc.yMin} yMax={tc.yMax} ySuffix="%" label="Operator utilization trend" series={tc.series} />
    <p class="cnote">{tc.note}</p>
    <div class="panel-head" style="margin-top:10px"><span class="panel-title">Verified replacements by operator</span><a class="lnk" href="#/reports/history">History →</a></div>
    <HBars logos data={shown.map((o) => ({ label: o.key, value: o.replacements, color: o.color }))} />
  </div>
</div>

<style>
  .cnote { margin: 4px 0 0; font-size: 10.5px; color: var(--faint); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-bottom: 12px; }
  .oh :global(.cc-brand) { display: inline-grid; border-radius: 50%; overflow: hidden; flex: none; } .oh :global(.cc-brand svg) { width: 100%; height: 100%; } .oh > div { min-width: 0; } .oh b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opc { text-align: left; padding: 14px; display: grid; gap: 9px; font: inherit; color: inherit; transition: opacity .2s, box-shadow .2s, transform .15s; }
  .opc:hover { box-shadow: var(--shadow); transform: translateY(-1px); } .opc.dim { opacity: .5; }
  .oh { display: flex; align-items: center; gap: 10px; } .oh > div { display: grid; line-height: 1.2; } .oh small { color: var(--muted); font-size: 11px; }
  .lg { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; }
  .tot { margin-left: auto; font-size: 20px; font-weight: 750; display: grid; text-align: right; line-height: 1.05; } .tot small { font-size: 10.5px; color: var(--muted); font-weight: 500; }
  .ou { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-2); }
  .og { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .og div { display: grid; background: #f8f9fb; border-radius: 8px; padding: 5px 7px; } .og small { font-size: 10.5px; color: var(--muted); } .og b { font-variant-numeric: tabular-nums; }
  .os { display: flex; justify-content: space-between; align-items: center; }
  .grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .mix { display: flex; gap: 2px; height: 14px; border-radius: 7px; overflow: hidden; }
  .mixl { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--ink-2); }
  .mixl span { display: flex; align-items: center; gap: 6px; } .mixl i { width: 8px; height: 8px; border-radius: 50%; } .mixl b { color: var(--ink); }
  .legend { display: flex; align-items: center; gap: 2px 5px; font-size: 10.5px; color: var(--muted); flex-wrap: wrap; justify-content: flex-end; min-width: 0; } .legend i { width: 7px; height: 7px; border-radius: 50%; margin-left: 6px; }
  .wrap { flex-wrap: wrap; }
  .lnk { font-size: 12px; font-weight: 600; color: var(--brand-600); }
  td.bad { color: var(--bad); font-weight: 700; }
  @media (max-width: 1180px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid2 { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) { .cards { grid-template-columns: minmax(0, 1fr); } }
</style>
