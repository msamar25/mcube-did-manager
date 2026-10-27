<script>
  import TicketDrawer from '../components/TicketDrawer.svelte';
  import LiveBadge from '../components/LiveBadge.svelte';
  import { db, opStats, totals, flowCounts, sceneData, poolActivity, trend, storyQueue } from '../lib/store.svelte.js';
  import { poolChart, trendChart } from '../lib/charts.js';
  import { rangePool, rangeTrend } from '../lib/range.svelte.js';
  import RangePicker from '../components/RangePicker.svelte';
  import { TICKET_ZONES } from '../lib/support.js';
  import { go } from '../lib/router.svelte.js';
  import { agoShort, n, pct } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import Scene3D from '../components/Scene3D.svelte';
  import HBars from '../components/charts/HBars.svelte';
  import LineChart from '../components/charts/LineChart.svelte';
  import Bars from '../components/charts/Bars.svelte';
  import Donut from '../components/charts/Donut.svelte';
  import Meter from '../components/Meter.svelte';
  import NetworkMap from '../components/NetworkMap.svelte';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { logoSvg } from '../three/logos.js';

  let ops = $derived(opStats());
  let t = $derived(totals());
  let flow = $derived(flowCounts());
  let data = $derived({ ...sceneData(), story: storyQueue() });
  let view = $state('3d'), selected = $state(null), opFilter = $state('all'), statusFilter = $state('all'), teamFilter = $state('all'), q = $state(''), auto = $state(false), sceneRef = $state(), hint = $state(true), stageEl, ticket = $state(null);
  onMount(() => { const off = () => (hint = false); const t = setTimeout(off, 7000); stageEl?.addEventListener('cc-interact', off); return () => { clearTimeout(t); stageEl?.removeEventListener('cc-interact', off); }; });
  // managers come from the employee directory (role5), so the filter matches real data
  let managers = $derived([...new Set(db.employees.map((e) => e.role5).filter(Boolean))].sort());
  let emp = $derived(new Map(db.employees.map((e) => [e.agent_number, e])));

  function pickOp(k) { opFilter = k; selected = k === 'all' ? null : { type: 'operator', key: k }; }
  function onselect(s) {
    if (s.type === 'none') return pickOp('all');
    if (s.type === 'operator') return pickOp(s.key);
    opFilter = 'all'; selected = s;
  }
  let selOp = $derived(selected?.type === 'operator' ? ops.find((o) => o.key === selected.key) : null);
  let recent = $derived(db.requests.filter((r) => (opFilter === 'all' || r.operator === opFilter) && (statusFilter === 'all' || r.status === statusFilter) && (teamFilter === 'all' || emp.get(r.agent_number)?.role5 === teamFilter)).slice(0, 4));
  let results = $derived(q.trim().length < 2 ? [] : db.inventory.filter((i) => i.status === 'active' && String(qIn === 'did' ? i.did : qIn === 'name' ? i.agent : qIn === 'number' ? i.agent_number : `${i.did} ${i.agent} ${i.agent_number}`).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6));
  let qIn = $state('all');
  let pc = $derived(poolChart(rangePool()));
  let tc = $derived(trendChart(ops, rangeTrend()));
  let selRequests = $derived(selOp ? db.requests.filter((r) => r.operator === selOp.key) : []);
</script>

<div class="cc">
  <div class="toolbar glass">
    <div class="seg" role="tablist" aria-label="View">
      <button class:on={view === '3d'} onclick={() => (view = '3d')}>3D</button>
      <button class:on={view === '2d'} onclick={() => (view = '2d')}>2D</button>
      <button class:on={view === 'map'} onclick={() => (view = 'map')}>Map</button>
    </div>
    <div class="spacer"></div>
    <div class="filters">
      <select class="select" value={opFilter} onchange={(e) => pickOp(e.currentTarget.value)} aria-label="Operator"><option value="all">All Operators</option>{#each ops as o}<option value={o.key}>{o.key}</option>{/each}</select>
      <select class="select" bind:value={statusFilter} aria-label="Request status"><option value="all">All Status</option>{#each ['pending', 'processing', 'completed', 'failed', 'review_required'] as s}<option value={s}>{s.replace('_', ' ')}</option>{/each}</select>
      <select class="select" bind:value={teamFilter} aria-label="Team"><option value="all">All Teams</option>{#each managers as m}<option value={m}>{m}</option>{/each}</select>
      <div class="search srch"><Icon name="search" size={14} /><input class="input" placeholder="Search agent or DID…" bind:value={q} aria-label="Search agent or DID" />
        {#if results.length}
          <div class="res">{#each results as r}<button onclick={() => go('command', 'agent', { n: r.agent_number })}><Person name={r.agent} sub={r.did} size={24} /><OpChip name={r.operator} /></button>{/each}</div>
        {/if}
      </div>
      <select class="select qin" bind:value={qIn} aria-label="Search in"><option value="all">Agent or DID</option><option value="did">DID</option><option value="name">Agent name</option><option value="number">Agent number</option></select>
    </div>
  </div>

  <section class="stage" bind:this={stageEl}>
    <Scene3D bind:this={sceneRef} {data} {selected} view={view === 'map' ? '3d' : view} autoRotate={auto} paused={view === 'map'} reserve=".hud-tools, .detail, .legend3d" {onselect} label="Interactive 3D map of operators, MCube hub, DID pool, agents and replacement flow" />
    {#if view === 'map'}<div class="map-layer"><NetworkMap operators={ops} {flow} pool={t.pool} agents={t.agents} selected={opFilter} onpick={(k) => pickOp(k)} /></div>{/if}

    <div class="hud-tools">
      <button class="btn btn-icon" title="Reset view" aria-label="Reset view" onclick={() => { pickOp('all'); sceneRef?.reset(); }}><Icon name="reset" size={15} /></button>
      <button class="btn btn-icon" class:act={auto} title="Auto-orbit" aria-label="Toggle auto orbit" aria-pressed={auto} onclick={() => (auto = !auto)}><Icon name={auto ? 'pause' : 'play'} size={15} /></button>
      <LiveBadge />
      {#if hint}<span class="hint" out:fade={{ duration: 400 }}>Drag to orbit · scroll to zoom · click a building</span>{/if}
    </div>

    {#if selOp}
      <div class="detail glass fade-up">
        <div class="dh">{@html logoSvg(selOp.key, 34)}<div><b>{selOp.key}</b><small>{selOp.family} · {n(selOp.total)} DIDs</small></div><button class="btn btn-icon btn-ghost btn-sm" aria-label="Close" onclick={() => pickOp('all')}><Icon name="x" size={14} /></button></div>
        <div class="dg">
          <div><small>Active</small><b>{n(selOp.active)}</b></div><div><small>Pool</small><b>{n(selOp.pool)}</b></div>
          <div><small>Inactive</small><b>{n(selOp.inactive)}</b></div><div><small>Duplicates</small><b class:bad={selOp.duplicates}>{n(selOp.duplicates)}</b></div>
        </div>
        <div class="du"><span>Utilization</span><b>{pct(selOp.utilization)}</b></div>
        <Meter value={selOp.utilization} color={selOp.color} />
        <div class="du"><span>Open requests</span><b>{selRequests.filter((r) => !['completed', 'failed'].includes(r.status)).length}</b></div>
        <div class="row"><button class="btn btn-sm" onclick={() => go('command', 'inventory', { op: selOp.key })}>Inventory</button><button class="btn btn-sm" onclick={() => go('command', 'operators', { op: selOp.key })}>Analytics</button><button class="btn btn-sm" onclick={() => go('command', 'pool')}>Pool</button></div>
      </div>
    {:else if selected && selected.type !== 'operator'}
      <div class="detail glass fade-up">
        <div class="dh"><span class="lg" style="background:{selected.type === 'pool' ? '#2a6fdb' : selected.type === 'agents' ? '#4f46e5' : '#f26b1d'}"><Icon name={selected.type === 'pool' ? 'pool' : selected.type === 'agents' ? 'users' : selected.type === 'flow' ? 'swap' : 'phone'} size={15} /></span>
          <div><b>{selected.type === 'pool' ? 'DID Pool' : selected.type === 'agents' ? 'Agents' : selected.type === 'flow' ? 'Replacement Flow' : 'UNext Support Team'}</b><small>{selected.type === 'pool' ? 'FIFO allocation order' : selected.type === 'agents' ? 'Employee directory' : selected.type === 'flow' ? 'Sequential, verified' : 'Handles DID replacements'}</small></div>
          <button class="btn btn-icon btn-ghost btn-sm" aria-label="Close" onclick={() => (selected = null)}><Icon name="x" size={14} /></button></div>
        {#if selected.type === 'pool'}
          <div class="dg"><div><small>Available</small><b>{n(t.pool)}</b></div><div><small>Next FIFO</small><b class="mono">{db.inventory.find((i) => i.fifo === 1)?.did}</b></div></div>
          <button class="btn btn-sm" onclick={() => go('command', 'pool')}>Open Pool Intelligence</button>
        {:else if selected.type === 'agents'}
          <div class="dg"><div><small>Directory</small><b>{n(t.agents)}</b></div><div><small>With active DID</small><b>{n(t.active)}</b></div></div>
          <button class="btn btn-sm" onclick={() => go('command', 'agent')}>Open Agent 360°</button>
        {:else if selected.type === 'flow'}
          <div class="dg">{#each Object.entries(TICKET_ZONES) as [k, z]}<button class="zc" class:hl={selected.key === k} onclick={() => (selected = { type: 'flow', key: k })}><small>{z.label}</small><b>{n(data.columns?.[k])}</b></button>{/each}</div>
          {#if selected.key}
            {@const list = db.requests.filter((r) => TICKET_ZONES[selected.key].statuses.includes(r.status)).sort((a, b) => String(b.completed_utc || b.first_call_utc).localeCompare(String(a.completed_utc || a.first_call_utc)))}
            <div class="tks">
              {#each list.slice(0, 6) as r (r.request_id)}
                <button class="tk" onclick={() => (ticket = r)}><b class="mono">{r.ticket_no}</b><span>{r.agent_name || r.agent_number}</span><small>{r.status === 'completed' ? `${r.current_did} → ${r.replacement_new_did || '—'} · ${agoShort(r.completed_utc)}` : `${r.current_did} · ${agoShort(r.first_call_utc)}`}</small></button>
              {:else}<div class="muted sm">No tickets</div>{/each}
            </div>
          {/if}
          <button class="btn btn-sm" onclick={() => go('command', 'replacement', { tab: { incoming: 'ready', progress: 'processing', resolved: 'done', failed: 'failed' }[selected.key] || 'ready' })}>Open Replacement Queue</button>
        {:else}
          <div class="dg"><div><small>Total DIDs</small><b>{n(t.total)}</b></div><div><small>Operators</small><b>{ops.length}</b></div></div>
        {/if}
      </div>
    {/if}
  </section>
  <TicketDrawer {ticket} onclose={() => (ticket = null)} />

  <aside class="rail">
    <div class="panel panel-pad tot">
      <div class="th"><span class="ti"><Icon name="phone" size={20} /></span><div><small>Total DIDs</small><b class="tnum">{n(t.total)}</b></div></div>
      <a class="li" href="#/command/inventory?status=active"><i style="background:var(--ok)"></i>Active Assignments<b class="g">{n(t.active)}</b></a>
      <a class="li" href="#/command/pool"><i style="background:var(--info)"></i>Available Pool<b class="b">{n(t.pool)}</b></a>
      <a class="li" href="#/command/replacement"><i style="background:var(--warn)"></i>Pending Replacement<b class="o">{n(flow.pending)}</b></a>
      <a class="li" href="#/command/replacement?tab=done"><i style="background:#16a34a"></i>Completed Replacements<b class="g">{n(flow.completed)}</b></a>
      <a class="li" href="#/command/risk"><i style="background:var(--bad)"></i>Duplicate Alerts<b class="r">{n(t.duplicates)}</b></a>
    </div>
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Operator Distribution</span></div>
      <HBars logos data={ops.map((o) => ({ label: o.key, value: o.active, color: o.color, note: `${o.pool} pool · ${pct(o.utilization)}` }))} onpick={(d) => pickOp(d.label)} />
    </div>
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">DID Utilization</span></div>
      <div class="dn">
        <Donut size={118} thickness={17} center={pct(t.utilization)} sub="Utilization" segments={[{ label: 'Active', value: t.active, color: '#f26b1d' }, { label: 'Pool', value: t.pool, color: '#d7dce4' }]} />
        <div class="dl">
          <div><i style="background:#f26b1d"></i>Active<b>{n(t.active)}</b></div>
          <div><i style="background:#d7dce4"></i>Pool<b>{n(t.pool)}</b></div>
          <div><i style="background:#8a93a3"></i>Inactive<b>{n(t.inactive)}</b></div>
        </div>
      </div>
    </div>
  </aside>

  <section class="bottom">
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Recent Replacement Requests</span><a class="lnk" href="#/requests/queue">All →</a></div>
      {#each recent as r}
        <div class="rr"><Person name={r.agent_name} sub={r.current_did} size={24} onclick={() => go('command', 'agent', { n: r.agent_number })} /><OpChip name={r.operator} /><Badge status={r.status} /><span class="muted when">{agoShort(r.first_call_utc)}</span></div>
      {:else}<div class="empty">No requests match these filters.</div>{/each}
    </div>
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Pool Activity</span><span class="legend">Pool now <b>{n(pc.poolNow)}</b></span></div>
      <RangePicker />
      <Bars labels={pc.labels} values={pc.series[0].values} height={112} label="Verified replacements from the pool" unit=" assigned" />
      <p class="cnote">{pc.note}</p>
    </div>
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">Utilization Trend</span><span class="legend">{#each ops as o}<i style="background:{o.color}"></i>{o.key}{/each}</span></div>
      <LineChart labels={tc.labels} height={112} yMin={tc.yMin} yMax={tc.yMax} ySuffix="%" label="Operator utilization trend" series={tc.series} />
      <p class="cnote">{tc.note}</p>
    </div>
  </section>
</div>

<style>
  .zc { border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 6px 8px; border-radius: 9px; display: grid; } .zc:hover { background: rgba(20,26,38,.05); }
  .tks { display: grid; gap: 4px; max-height: 260px; overflow: auto; }
  .tk { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; text-align: left; border: 1px solid var(--line-2); background: #fff; border-radius: 10px; padding: 7px 9px; cursor: pointer; font: inherit; } .tk:hover { border-color: #f8d0b5; background: var(--brand-50); }
  .tk b { font-size: 11.5px; } .tk span { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tk small { grid-column: 1 / -1; color: var(--muted); font-size: 11px; }
  .sm { font-size: 12px; }
  .dg .hl { outline: 2px solid var(--brand); outline-offset: -2px; }
  .qin { width: auto; }
  .cnote { margin: 4px 0 0; font-size: 10.5px; color: var(--faint); line-height: 1.35; } .legend b { color: var(--ink); }
  .cc { display: grid; grid-template-columns: minmax(0, 1fr) 292px; grid-template-rows: auto minmax(460px, 1fr) auto; gap: 12px; min-height: 100%; padding: 12px; }
  .toolbar { grid-column: 1; display: flex; gap: 10px; align-items: center; padding: 7px; border-radius: 14px; flex-wrap: wrap; position: relative; z-index: 20; }
  .stage { grid-column: 1; position: relative; border-radius: var(--r-xl); overflow: hidden; box-shadow: var(--shadow); border: 1px solid rgba(255,255,255,.9); }
  .map-layer { position: absolute; inset: 0; background: #f3f5f9; z-index: 2; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
  .filters .select { min-width: 132px; height: 32px; }
  .srch { width: 220px; } .srch .input { height: 32px; }
  .res { position: absolute; top: calc(100% + 6px); right: 0; width: 300px; padding: 6px; display: grid; gap: 2px; z-index: 30; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-lg); }
  .res button { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 9px; border: 0; background: transparent; text-align: left; }
  .res button:hover { background: rgba(20,26,38,.05); }
  .hud-tools { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; align-items: center; z-index: 5; }
  .hud-tools .btn { background: rgba(255,255,255,.94); box-shadow: var(--shadow-sm); }
  .hud-tools .btn.act { background: var(--brand-50); color: var(--brand-600); border-color: #f7c6a6; }
  .illus { font-size: 10.5px; font-weight: 600; color: #6d3fd1; background: rgba(243,236,255,.92); padding: 5px 9px; border-radius: 8px; }
  .hint { font-size: 11px; color: var(--ink-2); background: rgba(255,255,255,.9); padding: 6px 10px; border-radius: 8px; box-shadow: var(--shadow-sm); }
  .detail { position: absolute; left: 12px; top: 12px; width: 250px; padding: 12px; display: grid; gap: 9px; z-index: 6; }
  .dh { display: flex; align-items: center; gap: 10px; }
  .dh :global(.cc-brand) { display: inline-grid; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 2px #fff, var(--shadow-sm); } .dh :global(.cc-brand svg) { width: 100%; height: 100%; } .dh > div { display: grid; line-height: 1.2; flex: 1; } .dh small { color: var(--muted); font-size: 11px; }
  .lg { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; flex: none; }
  .dg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .dg div { background: rgba(255,255,255,.8); border: 1px solid var(--line-2); border-radius: 9px; padding: 6px 8px; display: grid; }
  .dg small { font-size: 10.5px; color: var(--muted); text-transform: capitalize; } .dg b { font-size: 15px; font-variant-numeric: tabular-nums; } .dg b.bad { color: var(--bad); }
  .du { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-2); }

  .rail { grid-row: 1 / 4; grid-column: 2; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-content: start; overflow: auto; }
  .tot { display: grid; gap: 2px; }
  .th { display: flex; gap: 12px; align-items: center; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid var(--line-2); }
  .ti { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #fff1d6, #ffe2b8); color: #d48806; }
  .th div { display: grid; line-height: 1.1; } .th small { color: var(--muted); } .th b { font-size: 28px; letter-spacing: -.03em; }
  .li { display: flex; align-items: center; gap: 9px; padding: 7px 4px; border-radius: 8px; font-size: 12.5px; color: var(--ink-2); }
  .li:hover { background: var(--line-2); }
  .li i { width: 9px; height: 9px; border-radius: 50%; } .li b { margin-left: auto; font-size: 14px; font-variant-numeric: tabular-nums; }
  .g { color: var(--ok); } .b { color: var(--info); } .o { color: var(--warn); } .r { color: var(--bad); }
  .dn { display: flex; align-items: center; gap: 14px; }
  .dl { display: grid; gap: 8px; flex: 1; font-size: 12px; }
  .dl div { display: flex; align-items: center; gap: 7px; } .dl i { width: 8px; height: 8px; border-radius: 50%; } .dl b { margin-left: auto; font-variant-numeric: tabular-nums; }

  .bottom { grid-column: 1; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .bottom .panel-head { margin-bottom: 6px; flex-wrap: wrap; row-gap: 2px; }
  .bottom .panel-title { white-space: nowrap; }
  .lnk { font-size: 12px; font-weight: 600; color: var(--brand-600); }
  .rr :global(.op-chip) { display: none; } /* narrow card: the agent name needs the room */
  .rr { display: grid; grid-template-columns: minmax(0, 1fr) 84px 58px; gap: 8px; align-items: center; padding: 5px 0; font-size: 12px; border-bottom: 1px solid var(--line-2); }
  .rr:last-child { border-bottom: 0; }
  .when { text-align: right; font-size: 11px; }
  .legend { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--muted); flex-wrap: wrap; justify-content: flex-end; }
  .legend i { width: 7px; height: 7px; border-radius: 50%; margin-left: 5px; }

  @media (max-width: 1360px) { .rr { grid-template-columns: minmax(0, 1fr) 84px 58px; } .rr :global(.op-chip) { display: none; } .srch { width: 180px; } .filters .select { min-width: 0; } }
  @media (max-width: 1180px) {
    .cc { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
    .stage { height: 60vh; min-height: 420px; }
    .rail { grid-row: auto; grid-column: 1; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: visible; }
    .bottom { grid-template-columns: 1fr 1fr; } .bottom > :first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 760px) {
    .cc { padding: 8px; gap: 8px; }
    .stage { height: 52vh; min-height: 340px; }
    .filters .select:nth-of-type(2), .filters .select:nth-of-type(3), .hint { display: none; }
    .filters { flex: 1; } .srch { flex: 1; width: auto; min-width: 120px; }
    .rail, .bottom { grid-template-columns: minmax(0, 1fr); }
    .detail { top: auto; bottom: 56px; left: 8px; right: 8px; width: auto; }
  }
</style>
