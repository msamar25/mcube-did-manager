<script>
  import { db } from '../lib/store.svelte.js';
  import { route, go } from '../lib/router.svelte.js';
  import { getAgentProfile } from '../lib/data/source.js';
  import { ago, ist, n, downloadCsv, initials, avatarColor } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import OpChip from '../components/OpChip.svelte';
  import Person from '../components/Person.svelte';
  import DidPassport from '../components/DidPassport.svelte';
  import ReassignModal from '../components/ReassignModal.svelte';

  const dayOf = (v) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(v));
  const timeOf = (v) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(v));
  // agents with recorded activity first, then everyone else
  const activity = new Map();
  for (const r of db.requests) activity.set(r.agent_number, (activity.get(r.agent_number) || 0) + 1);
  // Active and deactivated agents are listed separately. Deactivated = MCube status not active, or no
  // longer in the MCube employee directory (still holding a DID, or with recorded history).
  const isActive = (e) => e.status === 'active';
  let people = $derived([...db.employees].sort((a, b) => (activity.get(b.agent_number) || 0) - (activity.get(a.agent_number) || 0) || String(a.agent_name).localeCompare(String(b.agent_name))));
  let counts = $derived({ active: people.filter(isActive).length, off: people.filter((e) => !isActive(e)).length });
  const start = route.params.n || '';
  let tab = $state(start && db.employees.find((e) => e.agent_number === start && e.status !== 'active') ? 'off' : 'active');
  let q = $state(''), current = $state(start || db.employees.find((e) => e.status === 'active')?.agent_number || db.employees[0]?.agent_number), profile = $state(null), passport = $state(null), reassign = $state(false);
  let qIn = $state('all');
  const QF = { all: (e) => `${e.agent_name} ${e.agent_number} ${e.email || ''} ${e.role4 || ''} ${e.role5 || ''}`, name: (e) => e.agent_name, number: (e) => e.agent_number, team: (e) => `${e.role4 || ''} ${e.role5 || ''}` };
  let pool = $derived(people.filter((e) => (tab === 'active' ? isActive(e) : !isActive(e))));
  let filtered = $derived(pool.filter((e) => String(QF[qIn](e) || '').toLowerCase().includes(q.trim().toLowerCase())));
  let list = $derived(filtered.slice(0, 80));
  let entry = $derived(db.employees.find((e) => e.agent_number === current) || null);
  const STATUS = { active: ['active', 'Active'], deactivated: ['inactive', 'Deactivated in MCube'], missing: ['inactive', 'Not in MCube directory'] };
  $effect(() => { const c = current; profile = null; getAgentProfile(c).then((p) => { if (c === current) profile = p; }); });
  let timeline = $derived(profile ? [
    ...profile.lifecycle_events.map((e) => ({ t: e.time_utc, kind: 'log', title: e.event.replace(/_/g, ' '), sub: `${e.old_did} → ${e.new_did || '—'} · batch ${e.batch_id}`, tone: e.result === 'FAILED' ? 'bad' : e.event === 'REASSIGNMENT_COMPLETE' ? 'ok' : 'info' })),
    ...profile.requests.map((r) => ({ t: r.first_call_utc, kind: 'req', title: `Request ${r.ticket_no}`, sub: [r.request_source, `${r.call_count} call${r.call_count === 1 ? '' : 's'}`, r.status.replace(/_/g, ' ')].filter(Boolean).join(' · '), tone: 'warn' }))
  ].sort((a, b) => b.t.localeCompare(a.t)) : []);
</script>

<PageHead title="Agent 360°" eyebrow="Command Center">
  {#snippet actions()}<button class="btn" onclick={() => downloadCsv(filtered.map((e) => ({ agent: e.agent_name, number: e.agent_number, email: e.email, team_lead: e.role4, manager: e.role5, status: STATUS[e.status]?.[1] || e.status, holds_did: e.hasDid ? 'yes' : 'no' })), `agents-${tab === 'active' ? 'active' : 'deactivated'}.csv`)}><Icon name="download" size={14} />Export list</button>{/snippet}
</PageHead>

<div class="layout">
  <aside class="panel list">
    <div class="seg tabs" role="tablist"><button class:on={tab === 'active'} onclick={() => (tab = 'active')}>Active · {n(counts.active)}</button><button class:on={tab === 'off'} onclick={() => (tab = 'off')}>Deactivated · {n(counts.off)}</button></div>
    <div class="search ls"><Icon name="search" size={14} /><input class="input" placeholder="Search {n(pool.length)} agents" bind:value={q} aria-label="Search agents" /></div>
    <select class="select qin" bind:value={qIn} aria-label="Search in"><option value="all">In all</option><option value="name">Name</option><option value="number">Number</option><option value="team">Team lead / manager</option></select>
    <div class="items scroll-y">
      {#each list as e (e.agent_number)}
        <button class="it" class:on={e.agent_number === current} onclick={() => (current = e.agent_number)}>
          <Person name={e.agent_name} sub={e.agent_number} size={28} />
          {#if !isActive(e) && e.hasDid}<span class="hd" title="Still holds a DID">DID</span>{/if}
          {#if activity.get(e.agent_number)}<span class="cnt">{activity.get(e.agent_number)}</span>{/if}
        </button>
      {:else}<div class="empty">{tab === 'off' ? 'No deactivated agents.' : 'No agents match.'}</div>{/each}
      {#if filtered.length > list.length}<div class="muted more">Showing {list.length} of {n(filtered.length)} · search to narrow</div>{/if}
    </div>
  </aside>

  <section class="detail">
    {#if !profile}<div class="panel panel-pad empty">Loading profile…</div>{:else}
      {@const e = { ...(entry || {}), ...Object.fromEntries(Object.entries(profile.employee || {}).filter(([, v]) => v !== '' && v != null)), status: entry?.status || 'missing' }}
      <div class="panel head"><div class="banner"></div><div class="hb">
        <span class="av" style="background:{avatarColor(e.agent_name || current)}">{e.agent_name ? initials(e.agent_name) : '#'}</span>
        <div class="who"><h2>{e.agent_name || current}</h2><div class="meta"><span><Icon name="phone" size={13} />{e.agent_number || current}</span>{#if e.email}<span><Icon name="mail" size={13} />{e.email}</span>{/if}{#if e.role4 || e.role5}<span><Icon name="users" size={13} />{[e.role4, e.role5].filter(Boolean).join(' · ')}</span>{/if}</div></div>
        <div class="row-wrap acts"><Badge status={STATUS[e.status]?.[0] || 'inactive'} label={STATUS[e.status]?.[1] || e.status} />
          <button class="btn btn-sm" onclick={() => downloadCsv(timeline.map((x) => ({ time: x.t, event: x.title, detail: x.sub })), `agent-${e.agent_number}-timeline.csv`)}><Icon name="download" size={13} />Timeline</button>
          <button class="btn btn-sm btn-primary" disabled={!profile.current.length} onclick={() => (reassign = true)}><Icon name="swap" size={13} />Replace DID</button></div>
      </div></div>

      {#if e.status !== 'active' && profile.current.length}<div class="note warn"><Icon name="alert" size={15} /><span>{STATUS[e.status]?.[1]} but still holds DID {profile.current.map((c) => c.did).join(', ')}.</span></div>{/if}
      <div class="stats">
        <div class="panel panel-pad cur">
          <small class="lbl">Current DID</small>
          {#each profile.current as c}
            <div class="cd"><b class="mono">{c.did}</b><OpChip name={c.operator} />{#if c.duplicate}<Badge status="critical" label="Duplicate" />{/if}<button class="btn btn-sm btn-ghost" onclick={() => (passport = c.did)}>Passport</button></div>
            {#if c.since_utc}<small class="muted">Assigned {ago(c.since_utc)}</small>{/if}
          {:else}<div class="muted">No active DID in the latest snapshot.</div>{/each}
        </div>
        <div class="panel panel-pad st"><small class="muted">Requests</small><b>{n(profile.request_count)}</b><small class="muted">{profile.requests.filter((r) => !['completed', 'failed'].includes(r.status)).length} open</small></div>
        <div class="panel panel-pad st"><small class="muted">Verified replacements</small><b>{n(profile.replacement_count)}</b></div>
        <div class="panel panel-pad st"><small class="muted">Calls logged</small><b>{n(profile.requests.reduce((s, r) => s + Number(r.call_count || 0), 0))}</b></div>
      </div>

      <div class="cols">
        <div class="panel panel-pad">
          <div class="panel-head"><span class="panel-title">Event timeline</span><span class="panel-sub">{timeline.length} events</span></div>
          <div class="tl scroll-y">
            {#each timeline as x, i}
              {#if i === 0 || dayOf(x.t) !== dayOf(timeline[i - 1].t)}<div class="day">{dayOf(x.t)}</div>{/if}
              <div class="ev"><span class="dot {x.tone}"></span><div><b>{x.title}</b><small>{x.sub}</small></div><small class="when">{timeOf(x.t)}</small></div>
            {:else}<div class="empty">No recorded events for this agent.</div>{/each}
          </div>
        </div>
        <div class="panel panel-pad">
          <div class="panel-head"><span class="panel-title">Verified replacement history</span></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Completed</th><th>Old DID</th><th>New DID</th><th>Team at time</th></tr></thead>
            <tbody>
              {#each profile.replacements as h}<tr><td>{ist(h.completed_at_ist)}</td><td class="mono">{h.old_did}</td><td class="mono strong">{h.new_did}</td><td class="muted">{h.team_lead_at_sync}</td></tr>
              {:else}<tr><td colspan="4"><div class="empty">No verified replacements recorded.</div></td></tr>{/each}
            </tbody>
          </table></div>
          <div class="panel-head" style="margin-top:12px"><span class="panel-title">Requests</span></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Ticket</th><th>Source</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>{#each profile.requests.slice(0, 6) as r}<tr><td class="mono">{r.ticket_no}</td><td>{r.request_source}</td><td><Badge status={r.status} /></td><td class="muted">{ago(r.first_call_utc)}</td></tr>{:else}<tr><td colspan="4"><div class="empty">No requests.</div></td></tr>{/each}</tbody>
          </table></div>
        </div>
      </div>
    {/if}
  </section>
</div>

<DidPassport did={passport} onclose={() => (passport = null)} />
<ReassignModal open={reassign} items={profile?.current || []} onclose={() => (reassign = false)} />

<style>
  .qin { margin-top: 6px; }
  .tabs { width: 100%; } .tabs button { flex: 1; }
  .hd { font-size: 10px; font-weight: 700; color: #b42318; background: var(--bad-50); border-radius: 6px; padding: 1px 5px; margin-left: auto; margin-right: 6px; }
  .more { font-size: 11.5px; padding: 8px; text-align: center; }
  .layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 12px; align-items: start; }
  .list { padding: 10px; display: grid; gap: 8px; position: sticky; top: calc(var(--topbar-h) + 12px); }
  .ls .input { width: 100%; }
  .items { max-height: calc(100vh - 190px); display: grid; gap: 2px; align-content: start; }
  .it { display: flex; justify-content: space-between; align-items: center; padding: 7px 8px; border-radius: 10px; border: 0; background: transparent; text-align: left; }
  .it:hover { background: var(--line-2); } .it.on { background: var(--brand-50); box-shadow: inset 0 0 0 1px #f8d0b5; }
  .cnt { font-size: 10.5px; font-weight: 700; background: var(--line-2); border-radius: 8px; padding: 1px 6px; color: var(--ink-2); }
  .detail { display: grid; gap: 12px; min-width: 0; }
  .head { overflow: hidden; padding: 0; }
  .banner { height: 54px; background: radial-gradient(500px 120px at 15% 0%, rgba(255,138,61,.55), transparent 70%), radial-gradient(500px 140px at 90% 10%, rgba(42,111,219,.35), transparent 70%), linear-gradient(90deg, #fff3ea, #eef4ff); }
  .hb { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 0 16px 14px; margin-top: -26px; }
  .av { width: 62px; height: 62px; border-radius: 18px; display: grid; place-items: center; color: #fff; font-weight: 750; font-size: 20px; box-shadow: 0 0 0 4px #fff, 0 10px 20px -8px rgba(20,26,38,.35); }
  .who { flex: 1; min-width: 220px; } h2 { font-size: 18px; }
  .meta { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin-top: 3px; } .meta span { display: inline-flex; gap: 5px; align-items: center; }
  .stats { display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)); gap: 12px; }
  .cur { display: grid; gap: 4px; background: linear-gradient(135deg, #fff7f1, #ffffff 60%); border-color: #f6dccb; } .lbl { font-size: 11.5px; font-weight: 600; color: var(--brand-600); text-transform: uppercase; letter-spacing: .06em; } .cd { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .cd b { font-size: 19px; letter-spacing: -.01em; }
  .st { display: grid; gap: 1px; } .st b { font-size: 22px; font-weight: 750; font-variant-numeric: tabular-nums; }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
  .day { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); padding-top: 4px; border-top: 1px dashed var(--line); }
  .day:first-child { border-top: 0; padding-top: 0; }
  .tl { display: grid; gap: 9px; max-height: 360px; padding-right: 4px; margin-bottom: 10px; }
  .ev { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: start; font-size: 12px; } .ev div { display: grid; } .ev small { color: var(--muted); font-size: 11px; } .when { white-space: nowrap; }
  .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; background: var(--info); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-50); } .dot.bad { background: var(--bad); box-shadow: 0 0 0 3px var(--bad-50); } .dot.warn { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-50); } .dot.info { box-shadow: 0 0 0 3px var(--info-50); }
  @media (max-width: 1180px) { .cols { grid-template-columns: minmax(0, 1fr); } .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 820px) { .layout { grid-template-columns: minmax(0, 1fr); } .list { position: static; } .items { max-height: 220px; } }
</style>
