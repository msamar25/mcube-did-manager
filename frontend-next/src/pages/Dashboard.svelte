<script>
  import { db, opStats, totals, flowCounts, poolActivity } from '../lib/store.svelte.js';
  import { poolChart } from '../lib/charts.js';
  import { parseTs, replacementsSince } from '../lib/calc.js';
  import { session } from '../lib/session.svelte.js';
  import { computeAlerts } from '../lib/risk.js';
  import { go } from '../lib/router.svelte.js';
  import { ago, n, pct } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import SupportScene from '../components/SupportScene.svelte';
  import SupportMap from '../components/SupportMap.svelte';
  import { supportData, TICKET_ZONES, ADMISSIONS_ZONES, ADMISSIONS_ENABLED, STATUS_FILTER } from '../lib/support.js';
  import { onMount } from 'svelte';
  import HBars from '../components/charts/HBars.svelte';
  import { logoSvg } from '../three/logos.js';
  import LineChart from '../components/charts/LineChart.svelte';
  import Bars from '../components/charts/Bars.svelte';
  import Meter from '../components/Meter.svelte';
  import Spark from '../components/charts/Spark.svelte';

  // $derived: values update by themselves when the store refreshes in the background
  let ops = $derived(opStats());
  let t = $derived(totals());
  let flow = $derived(flowCounts());
  let alerts = $derived(computeAlerts({ operators: ops, agents: db.insights?.agents || [], requests: db.requests, duplicates: t.duplicates, lastSync: db.lastSync, inventory: db.inventory }));
  let recent = $derived(db.requests.slice(0, 5));
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  let last24 = $derived(db.requests.filter((r) => Date.now() - parseTs(r.first_call_utc) < 864e5).length);
  let doneToday = $derived(replacementsSince(db.logs, 24).length);
  let pc = $derived(poolChart(poolActivity()));
  let byDay = $derived((db.insights?.by_day || []).slice(-14).map((d) => d.requests));
  const stages = [
    { k: 'pending', label: 'Pending', c: 'var(--warn)' }, { k: 'processing', label: 'Processing', c: 'var(--info)' },
    { k: 'completed', label: 'Completed', c: 'var(--ok)' }, { k: 'failed', label: 'Failed', c: 'var(--bad)' }
  ];
  const flowMax = Math.max(...stages.map((s) => flow[s.k]));
  let sel = $state(null), view = $state('3d'), story = $state(null), riskOpen = $state(false), sceneRef = $state(), mobile = $state(false);
  let sd = $derived(supportData(db.requests));
  onMount(() => { const mq = matchMedia('(max-width: 760px)'); const f = () => (mobile = mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); });
  function onselect(x) { sel = x?.type && x.type !== 'none' ? x : null; }
  const zoneReq = (k) => db.requests.filter((r) => TICKET_ZONES[k].statuses.includes(r.status));
  let selInfo = $derived.by(() => {
    if (!sel) return null;
    if (sel.type === 'operator') { const o = ops.find((x) => x.key === sel.key); if (!o) return null; return { logo: o.key, title: o.key, sub: o.family, stats: [['Active', n(o.active)], ['Pool', n(o.pool)], ['Utilization', pct(o.utilization)], ['Inactive', n(o.inactive)]], cta: 'Operator analytics', go: () => go('command', 'operators', { op: o.key }) }; }
    if (sel.type === 'hub') return { icon: 'users', title: 'UNext L1 Support Team', sub: 'Investigates and resolves agent support tickets', stats: [['Incoming', n(sd.counts.incoming)], ['In progress', n(sd.counts.progress)], ['Resolved', n(sd.counts.resolved)], ['Failed', n(sd.counts.failed)]], cta: 'Support requests', go: () => go('requests', 'queue') };
    if (sel.type === 'zone' && TICKET_ZONES[sel.key]) { const z = TICKET_ZONES[sel.key]; return { icon: { incoming: 'mail', progress: 'refresh', resolved: 'ok', failed: 'alert' }[sel.key], color: z.color, title: z.label, sub: 'Status: ' + z.statuses.join(', '), stats: [['Tickets', n(sd.counts[sel.key])]], list: zoneReq(sel.key).slice(0, 3), cta: 'Open in Support Requests', go: () => go('requests', 'queue', { status: STATUS_FILTER[sel.key] }) }; }
    if (sel.type === 'zone' && ADMISSIONS_ENABLED && ADMISSIONS_ZONES[sel.key]) return { icon: { enquiries: 'agent', guidance: 'headset', application: 'file', payment: 'check' }[sel.key], title: ADMISSIONS_ZONES[sel.key].label, sub: 'Admissions journey stage', stats: [['Preview figure', n(sd.admissions[sel.key])]], note: 'Stage-level counts are not tracked by the backend yet; this is preview data.', cta: 'Support requests', go: () => go('requests', 'queue') };
    if (sel.type === 'agents') return { icon: 'users', title: 'Agents', sub: 'Raise DID replacement requests', stats: [['Directory', n(t.agents)], ['With DID', n(t.active)], ['Requests 24h', n(last24)], ['Replaced 24h', n(doneToday)]], cta: 'Agent 360°', go: () => go('command', 'agent') };
    if (sel.type === 'pool') return { icon: 'pool', title: 'DID Pool', sub: 'FIFO allocation', stats: [['Available', n(t.pool)], ['Operators', ops.length]], cta: 'Pool intelligence', go: () => go('command', 'pool') };
    if (sel.type === 'flow') return { icon: 'swap', title: 'Replacement flow', sub: 'One agent at a time, verified', stats: [['Pending', n(flow.pending)], ['Processing', n(flow.processing)], ['Completed', n(flow.completed)], ['Failed', n(flow.failed)]], cta: 'Replacement queue', go: () => go('command', 'replacement') };
    if (sel.type === 'team') return { icon: 'users', title: 'Team huddle', sub: 'Illustrative collaboration area', stats: [['Teams', n(db.insights?.teams?.length)], ['Requests', n(db.requests.length)]], cta: 'Team performance', go: () => go('analytics', 'teams') };
    return null;
  });
</script>

<div class="dash">
  <section class="hero" class:m={mobile}>
    {#if !mobile}
      <div class="scene-wrap">
        {#if view === '3d'}<SupportScene bind:this={sceneRef} data={sd} selected={sel} {onselect} onstep={(x) => (story = x)} reserve=".hero-ui" />
        {:else}<div class="map2d"><SupportMap data={sd} selected={sel} onpick={onselect} /></div>{/if}
      </div>
    {/if}
    <div class="hero-ui greet glass">
      <div><span class="eyebrow">{today}</span><h1>{greet}, {session.name.split(' ')[0]}</h1><p>{n(sd.open)} open tickets · synced {ago(db.lastSync)}</p>{#if !mobile && view === '3d'}<span class="illus">Illustrative animation · not live cases</span>{/if}</div>
      <div class="row"><button class="btn btn-primary btn-sm" onclick={() => go('requests', 'queue')}><Icon name="inbox" size={13} />Support requests</button><button class="btn btn-sm" onclick={() => go('command', '3d')}><Icon name="cube" size={13} />DID Command Center</button></div>
    </div>
    {#if mobile}<div class="hero-ui mmap"><SupportMap data={sd} selected={sel} onpick={onselect} compact /></div>{/if}
    <div class="hero-ui kpis glass">
      <button onclick={() => onselect({ type: 'zone', key: 'incoming' })}><small>Incoming</small><b class="o">{n(sd.counts.incoming)}</b></button>
      <button onclick={() => onselect({ type: 'zone', key: 'progress' })}><small>In progress</small><b class="bl">{n(sd.counts.progress)}</b></button>
      <button onclick={() => onselect({ type: 'zone', key: 'resolved' })}><small>Resolved</small><b class="g">{n(sd.counts.resolved)}</b></button>
      <button onclick={() => onselect({ type: 'zone', key: 'failed' })}><small>Failed</small><b class="r">{n(sd.counts.failed)}</b></button>
      <span class="sep"></span>
      <button onclick={() => go('command', 'inventory')}><small>Total DIDs</small><b>{n(t.total)}</b></button>
      <button onclick={() => go('command', 'pool')}><small>DID pool</small><b>{n(t.pool)}</b></button>
    </div>
    <div class="hero-ui risk glass" class:open={riskOpen}>
      <button class="rh" onclick={() => (riskOpen = !riskOpen)} aria-expanded={riskOpen}><span><Icon name="shield" size={13} />Risk Radar</span><em>{alerts.length}</em><Icon name="down" size={13} /></button>
      {#if riskOpen}
        {#each alerts.slice(0, 3) as a}<div class="al"><span class="sev {a.severity.toLowerCase()}"></span><span><b>{a.subject}</b><small>{a.kind}</small></span></div>{/each}
        <button class="lnk" onclick={() => go('command', 'risk')}>Open Risk Radar →</button>
      {/if}
    </div>
    {#if !mobile}
      <div class="hero-ui tools">
        <div class="seg" role="tablist" aria-label="Hub view"><button class:on={view === '3d'} onclick={() => (view = '3d')}>3D</button><button class:on={view === '2d'} onclick={() => (view = '2d')}>2D</button></div>
        {#if view === '3d'}<button class="btn btn-sm" onclick={() => { sel = null; sceneRef?.reset(); }}><Icon name="reset" size={13} />Reset view</button>{/if}
        {#if story && view === '3d'}<span class="story" class:fail={story.failed && story.phase === 3}><i></i>{story.step}</span>{/if}
      </div>
    {/if}
    {#if selInfo}
      <div class="hero-ui ctx glass fade-up" role="dialog" aria-label={selInfo.title}>
        <div class="ch">{#if selInfo.logo}{@html logoSvg(selInfo.logo, 26)}{:else}<span class="ci" style={selInfo.color ? `background:${selInfo.color}22;color:${selInfo.color}` : ''}><Icon name={selInfo.icon} size={14} /></span>{/if}<span><b>{selInfo.title}</b><small>{selInfo.sub}</small></span><button class="btn btn-icon btn-ghost btn-sm" aria-label="Close" onclick={() => (sel = null)}><Icon name="x" size={13} /></button></div>
        <div class="cg">{#each selInfo.stats as [k, v]}<div><small>{k}</small><b>{v}</b></div>{/each}</div>
        {#if selInfo.list?.length}<div class="tl">{#each selInfo.list as r}<button onclick={() => go('command', 'agent', { n: r.agent_number })}><span>{r.ticket_no}</span><em>{r.agent_name}</em></button>{/each}</div>{/if}
        {#if selInfo.note}<p class="nt">{selInfo.note}</p>{/if}
        <button class="btn btn-sm" onclick={selInfo.go}>{selInfo.cta} →</button>
      </div>
    {/if}
  </section>

  <section class="cards">
    <div class="panel panel-pad flow">
      <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="refresh" size={14} /></span>Replacement Flow</span><a class="lnk" href="#/command/replacement">Queue →</a></div>
      {#each stages as s}
        <div class="st"><span class="sl">{s.label}</span><div class="sb"><Meter value={flow[s.k]} max={flowMax} color={s.c} height={8} /></div><b class="tnum">{n(flow[s.k])}</b></div>
      {/each}
      <div class="note"><Icon name="shieldok" size={14} />One agent at a time: fresh inventory → deactivate → activate → verify.</div>
    </div>

    <div class="panel panel-pad recent">
      <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="inbox" size={14} /></span>Recent Replacement Requests</span><a class="lnk" href="#/requests/queue">All →</a></div>
      <div class="rl">
        {#each recent as r}
          <div class="rr">
            <Person name={r.agent_name} sub={r.current_did} onclick={() => go('command', 'agent', { n: r.agent_number })} />
            <OpChip name={r.operator} />
            <Badge status={r.status} />
            <span class="muted when">{ago(r.first_call_utc)}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="pool" size={14} /></span>Pool Activity · 24h</span>
        <span class="legend">Pool now <b>{n(pc.poolNow)}</b></span></div>
      <Bars labels={pc.labels} values={pc.series[0].values} height={140} label="Verified replacements from the pool, last 24 hours" unit=" assigned" />
      <p class="cnote">{pc.note}</p>
    </div>

    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="operators" size={14} /></span>Operator Distribution</span><a class="lnk" href="#/command/operators">Details →</a></div>
      <HBars logos data={ops.map((o) => ({ label: o.operator, value: o.active, color: o.color, note: `${o.pool} in pool · ${pct(o.utilization)}` }))} onpick={(d) => (sel = { type: 'operator', key: d.label })} />
    </div>
  </section>
</div>

<style>
  .dash { display: grid; gap: 12px; grid-template-rows: minmax(500px, 1fr) auto; min-height: calc(100vh - var(--topbar-h) - 2 * var(--gutter)); min-width: 0; }
  .hero { position: relative; border-radius: var(--r-xl); overflow: hidden; min-height: 500px; border: 1px solid rgba(255,255,255,.9); box-shadow: var(--shadow); min-width: 0; }
  .scene-wrap { position: absolute; inset: 0; }
  .map2d { position: absolute; inset: 0; display: grid; place-items: center; padding: 70px 24px 70px; background: #f1eeea; }
  .map2d :global(.map) { width: min(900px, 100%); }
  .hero-ui { position: absolute; z-index: 3; }
  .glass { background: rgba(255,255,255,.8) !important; box-shadow: 0 10px 30px -18px rgba(20,26,38,.45), inset 0 1px 0 rgba(255,255,255,.9) !important; }
  .greet { top: 12px; left: 12px; display: flex; align-items: center; gap: 14px; padding: 8px 10px 8px 14px; border-radius: 14px; max-width: calc(100% - 24px); }
  .greet .eyebrow { font-size: 9.5px; } .greet h1 { font-size: 15px; letter-spacing: -.025em; line-height: 1.15; } .greet p { font-size: 11px; color: var(--muted); }
  .kpis { left: 12px; bottom: 54px; display: flex; align-items: center; gap: 1px; padding: 4px; border-radius: 14px; max-width: calc(100% - 300px); overflow-x: auto; scrollbar-width: none; }
  .kpis button { display: grid; gap: 0; text-align: left; border: 0; background: transparent; padding: 4px 11px; border-radius: 10px; line-height: 1.15; flex: none; }
  .kpis button:hover { background: rgba(255,255,255,.95); }
  .kpis small { font-size: 10px; color: var(--muted); font-weight: 600; white-space: nowrap; } .kpis b { font-size: 16px; font-weight: 750; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .kpis .sep { width: 1px; height: 26px; background: var(--line); margin: 0 3px; flex: none; }
  .g { color: var(--ok); } .bl { color: var(--info); } .o { color: var(--warn); } .r { color: var(--bad); }
  .risk { top: 12px; right: 12px; width: 230px; padding: 4px; border-radius: 12px; display: grid; gap: 4px; }
  .risk:not(.open) { width: auto; }
  .rh { display: flex; align-items: center; gap: 8px; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 650; padding: 4px 6px; cursor: pointer; color: var(--ink); }
  .rh span { display: inline-flex; gap: 6px; align-items: center; } .rh :global(svg:first-child) { color: var(--brand); }
  .rh em { font-style: normal; font-size: 11px; font-weight: 750; background: var(--bad-50); color: var(--bad); border-radius: 8px; padding: 1px 7px; margin-left: auto; }
  .lnk { border: 0; background: none; color: var(--brand-600); font-weight: 650; font-size: 11.5px; cursor: pointer; justify-self: start; padding: 2px 6px 4px; }
  .al { display: flex; gap: 8px; align-items: flex-start; padding: 5px 6px; border-radius: 8px; background: rgba(255,255,255,.7); }
  .al span:last-child { display: grid; min-width: 0; line-height: 1.25; } .al b { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .al small { font-size: 10.5px; color: var(--muted); }
  .sev { width: 7px; height: 7px; border-radius: 50%; margin-top: 4px; flex: none; background: var(--faint); }
  .sev.critical { background: var(--bad); box-shadow: 0 0 0 3px var(--bad-50); } .sev.attention { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-50); } .sev.review { background: #8b5cf6; }
  .tools { left: 12px; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 8px; pointer-events: none; flex-wrap: wrap; }
  .tools > * { pointer-events: auto; }
  .tools .seg, .tools .btn { box-shadow: var(--shadow-sm); }
  .story { display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 650; color: var(--ink-2); background: rgba(255,255,255,.9); padding: 6px 11px; border-radius: 99px; box-shadow: var(--shadow-sm); }
  .story i { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); animation: pulse 1.6s infinite; } .story.fail i { background: var(--bad); }
  .illus { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 650; color: #6d3fd1; background: rgba(243,236,255,.92); padding: 2px 7px; border-radius: 6px; }
  @media (max-width: 1100px) { .hero:not(.m) { min-height: 600px; } .hero:not(.m) .greet .row { display: none; } }
  .ctx { right: 12px; top: 56px; width: 270px; padding: 11px; border-radius: 14px; display: grid; gap: 8px; }
  .ch { display: flex; align-items: center; gap: 9px; } .ch > span:nth-child(2) { display: grid; flex: 1; line-height: 1.2; min-width: 0; } .ch b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; } .ch small { font-size: 11px; color: var(--muted); }
  .ch :global(.cc-brand) { display: inline-grid; border-radius: 50%; overflow: hidden; flex: none; } .ch :global(.cc-brand svg) { width: 100%; height: 100%; }
  .ci { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--brand-50); color: var(--brand-600); flex: none; }
  .cg { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; } .cg div { display: grid; padding: 5px 8px; border-radius: 8px; background: rgba(255,255,255,.85); } .cg small { font-size: 10px; color: var(--muted); } .cg b { font-size: 14px; font-variant-numeric: tabular-nums; }
  .tl { display: grid; gap: 3px; } .tl button { display: flex; justify-content: space-between; gap: 8px; border: 0; background: rgba(255,255,255,.85); border-radius: 7px; padding: 5px 8px; font: inherit; font-size: 11px; cursor: pointer; text-align: left; } .tl span { font-family: ui-monospace, monospace; } .tl em { font-style: normal; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nt { font-size: 10.5px; color: var(--muted); }
  /* mobile: no 3D, stacked compact layout (no absolutely-positioned overlays) */
  .hero.m { min-height: 0; display: grid; gap: 10px; padding: 10px; background: rgba(255,255,255,.55); }
  .hero.m .hero-ui { position: static; max-width: none; width: auto; }
  .hero.m .greet { flex-wrap: wrap; } .hero.m .greet .row { flex-wrap: wrap; }
  .hero.m .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; overflow: visible; }
  .hero.m .kpis .sep { display: none; } .hero.m .kpis button { padding: 6px 8px; }
  .hero.m .risk { order: 5; width: auto; }
  .hero.m .ctx { order: 3; }
  .cards { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; }
  .lnk { font-size: 12px; font-weight: 600; color: var(--brand-600); }
  .flow { display: grid; gap: 9px; align-content: start; }
  .flow .panel-head { margin-bottom: 0; }
  .st { display: grid; grid-template-columns: 74px 1fr 34px; align-items: center; gap: 8px; font-size: 12px; }
  .st b { text-align: right; } .sl { color: var(--ink-2); font-weight: 550; }
  .flow .note { font-size: 11px; padding: 7px 9px; }
  .rl { display: grid; }
  .rr { display: grid; grid-template-columns: minmax(0, 1.5fr) 80px 92px 72px; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line-2); font-size: 12px; }
  .rr:last-child { border-bottom: 0; }
  .when { text-align: right; font-size: 11.5px; }
  .legend { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); } .legend b { color: var(--ink); }
  .cnote { margin: 4px 0 0; font-size: 10.5px; color: var(--faint); }
  .legend i { width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; }

  @media (max-width: 1360px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 1100px) { .kpis { bottom: 54px; max-width: calc(100% - 24px); } }
  @media (max-width: 900px) { .rr { grid-template-columns: minmax(0, 1fr) 92px 72px; } .rr :global(.op-chip) { display: none; } }
  @media (max-width: 760px) {
    .dash { grid-template-rows: auto; min-height: 0; }
    .cards { grid-template-columns: minmax(0, 1fr); }
    .rr { grid-template-columns: minmax(0, 1fr) auto; } .rr :global(.op-chip), .when { display: none; }
  }
</style>
