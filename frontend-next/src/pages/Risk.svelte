<script>
  import { db, opStats, totals } from '../lib/store.svelte.js';
  import { go } from '../lib/router.svelte.js';
  import { computeAlerts, DEFAULT_RULES } from '../lib/risk.js';
  import { ago, downloadCsv } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Kpi from '../components/Kpi.svelte';
  import DidPassport from '../components/DidPassport.svelte';

  let ops = $derived(opStats());
  let t = $derived(totals());
  let rules = $state({ ...DEFAULT_RULES }), q = $state(''), sev = $state('all'), passport = $state(null), stamp = $state(Date.now());
  let alerts = $derived(computeAlerts({ operators: ops, agents: db.insights?.agents || [], requests: db.requests, duplicates: t.duplicates, lastSync: db.lastSync, inventory: db.inventory }, rules, stamp));
  let visible = $derived(alerts.filter((a) => (sev === 'all' || a.severity === sev) && `${a.kind} ${a.subject} ${a.detail}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s) => alerts.filter((a) => a.severity === s).length;
  let kinds = $derived([...new Set(alerts.map((a) => a.kind))].map((k) => [k, alerts.filter((a) => a.kind === k).length]));
</script>

<PageHead title="Risk Radar" sub="Rule-based early warnings from synced data — no predictions, no extra MCube calls" eyebrow="Command Center">
  {#snippet actions()}
    <button class="btn" onclick={() => (stamp = Date.now())}><Icon name="refresh" size={14} />Recalculate</button>
    <button class="btn btn-primary" disabled={!visible.length} onclick={() => downloadCsv(visible.map((a) => ({ severity: a.severity, category: a.kind, subject: a.subject, detail: a.detail, agent_number: a.agent_number || '', did: a.did || '', generated_utc: new Date(stamp).toISOString() })), 'did-risk-alerts.csv')}><Icon name="download" size={14} />Export alerts</button>
  {/snippet}
</PageHead>

<div class="kpis">
  <Kpi label="Critical" value={count('Critical')} sub="investigate now" icon="alert" tone="bad" onclick={() => (sev = 'Critical')} />
  <Kpi label="Attention" value={count('Attention')} sub="threshold exceeded" icon="clock" tone="warn" onclick={() => (sev = 'Attention')} />
  <Kpi label="Repeat demand" value={count('Review')} sub="agents to review" icon="users" tone="brand" onclick={() => (sev = 'Review')} />
  <Kpi label="Data freshness" value={ago(db.lastSync).replace(' ago', '')} sub="since inventory sync" icon="refresh" tone="info" />
</div>

<div class="layout">
  <aside class="panel panel-pad rules">
    <div class="panel-title">Detection rules</div>
    <p class="muted">Adjust for analysis. Not saved, and never applied to replacement logic.</p>
    <label class="field">Low operator pool<input class="input" type="number" min="0" bind:value={rules.minPool} /><small>Flag operators with fewer available DIDs</small></label>
    <label class="field">Agent request count<input class="input" type="number" min="2" bind:value={rules.repeatLimit} /><small>Flag agents with at least this many requests</small></label>
    <label class="field">Pending request age<select class="select" bind:value={rules.ageingHours}>{#each [8, 12, 24, 48, 72] as h}<option value={h}>{h} hours</option>{/each}</select></label>
    <label class="field">Stale inventory sync<select class="select" bind:value={rules.staleHours}>{#each [1, 2, 4, 8, 24] as h}<option value={h}>{h} hours</option>{/each}</select></label>
    <div class="kinds">{#each kinds as [k, c]}<span><b>{c}</b>{k}</span>{/each}</div>
  </aside>
  <section class="panel panel-pad">
    <div class="bar">
      <div class="seg">{#each ['all', 'Critical', 'Attention', 'Review', 'Unknown'] as s}<button class:on={sev === s} onclick={() => (sev = s)}>{s === 'all' ? 'All' : s}</button>{/each}</div>
      <div class="spacer"></div>
      <div class="search"><Icon name="search" size={14} /><input class="input" placeholder="Search alerts" bind:value={q} aria-label="Search alerts" /></div>
    </div>
    <div class="list scroll-y">
      {#each visible.slice(0, 150) as a}
        <article class="al">
          <span class="sev {a.severity.toLowerCase()}"><Icon name={a.severity === 'Critical' ? 'alert' : a.severity === 'Review' ? 'users' : 'clock'} size={14} /></span>
          <div class="txt"><span class="tag">{a.kind} · {a.severity}</span><b>{a.subject}</b><small>{a.detail}</small></div>
          <div class="acts">
            {#if a.did}<button class="btn btn-sm" onclick={() => (passport = a.did)}>DID passport</button>{/if}
            {#if a.agent_number}<button class="btn btn-sm" onclick={() => go('command', 'agent', { n: a.agent_number })}>Agent 360°</button>{/if}
            {#if a.kind === 'Pool capacity'}<button class="btn btn-sm" onclick={() => go('command', 'pool')}>Pool</button>{/if}
          </div>
        </article>
      {:else}<div class="empty">No alerts match. An empty list doesn't guarantee data quality.</div>{/each}
    </div>
    <div class="note" style="margin-top:10px"><Icon name="info" size={14} />Alerts use current inventory, stored request timestamps, recorded request counts and the last sync time. They don't forecast depletion or infer missing history.</div>
  </section>
</div>
<DidPassport did={passport} onclose={() => (passport = null)} />

<style>
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; align-items: start; }
  .rules { display: grid; gap: 11px; } .rules p { font-size: 12px; }
  .kinds { display: grid; gap: 6px; border-top: 1px solid var(--line-2); padding-top: 10px; font-size: 12px; color: var(--ink-2); } .kinds b { display: inline-block; min-width: 26px; color: var(--ink); }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .list { display: grid; gap: 8px; max-height: calc(100vh - 360px); min-height: 280px; align-content: start; }
  .al { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; }
  .al:hover { border-color: var(--line); background: #fff; }
  .sev { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--line-2); color: var(--muted); }
  .sev.critical { background: var(--bad-50); color: var(--bad); } .sev.attention { background: var(--warn-50); color: var(--warn); } .sev.review { background: #f3ecff; color: #6d3fd1; }
  .txt { display: grid; min-width: 0; line-height: 1.3; } .tag { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); } .txt small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acts { display: flex; gap: 6px; }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .al { grid-template-columns: 32px minmax(0, 1fr); } .acts { grid-column: 2; } }
</style>
