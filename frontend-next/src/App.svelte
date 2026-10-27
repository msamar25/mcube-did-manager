<script>
  import { onMount } from 'svelte';
  import { route, go, NAV } from './lib/router.svelte.js';
  import { session, signOut, signIn, restore } from './lib/session.svelte.js';
  import { db, load, flowCounts, live, refresh, startAutoRefresh, stopAutoRefresh, resetData } from './lib/store.svelte.js';
  import { DEMO_NOTICE, LIVE } from './lib/data/source.js';
  import { notifText } from './lib/format.js';
  import { ago, initials } from './lib/format.js';
  import Icon from './components/Icon.svelte';
  import UnextLogo from './components/UnextLogo.svelte';
  import Toast from './components/Toast.svelte';
  import Login from './pages/Login.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  // Pages load on demand: only the Dashboard ships in the first download, the rest are fetched
  // the first time they are opened (and then cached by the browser).
  const lazy = {
    command: () => import('./pages/CommandCenter.svelte'), inventory: () => import('./pages/Inventory.svelte'),
    operators: () => import('./pages/Operators.svelte'), pool: () => import('./pages/Pool.svelte'),
    agent: () => import('./pages/Agent360.svelte'), replacement: () => import('./pages/Replacement.svelte'),
    requests: () => import('./pages/Requests.svelte'), form: () => import('./pages/PublicForm.svelte'),
    notifications: () => import('./pages/Notifications.svelte'), risk: () => import('./pages/Risk.svelte'),
    insights: () => import('./pages/Insights.svelte'), teams: () => import('./pages/Teams.svelte'),
    reports: () => import('./pages/Reports.svelte'), settings: () => import('./pages/Settings.svelte')
  };
  const PAGES = {
    'command/3d': lazy.command, 'command/inventory': lazy.inventory, 'command/operators': lazy.operators, 'command/pool': lazy.pool,
    'command/agent': lazy.agent, 'command/replacement': lazy.replacement, 'command/risk': lazy.risk,
    'requests/queue': lazy.requests, 'requests/public-form': lazy.form, 'requests/notifications': lazy.notifications,
    'analytics/insights': lazy.insights, 'analytics/teams': lazy.teams,
    'reports/audit': lazy.reports, 'reports/history': lazy.reports, 'reports/exports': lazy.reports,
    'settings/intake': lazy.settings, 'settings/safety': lazy.settings, 'settings/notifications': lazy.settings, 'settings/email': lazy.settings,
    'settings/employees': lazy.settings, 'settings/credentials': lazy.settings, 'settings/advanced': lazy.settings
  };
  const pageCache = new Map();
  function pageFor(key) {
    const loader = PAGES[key]; if (!loader) return Promise.resolve(Dashboard);
    if (!pageCache.has(loader)) pageCache.set(loader, loader().then((m) => m.default).catch((e) => { pageCache.delete(loader); throw e; }));
    return pageCache.get(loader);
  }

  let nav = $derived(NAV.filter((s) => !s.admin || session.role === 'admin'));
  let section = $derived(nav.find((s) => s.id === route.section) || nav[0]);
  let blocked = $derived(route.section === 'settings' && session.role !== 'admin');
  let pagePromise = $derived(pageFor(`${route.section}/${route.page}`));
  let fullBleed = $derived(route.section === 'command' && route.page === '3d');
  let noSidebar = $derived(route.section === 'dashboard');
  let menuOpen = $state(false), userOpen = $state(false), bellOpen = $state(false);
  let pendingCount = $derived(flowCounts().pending);

  onMount(() => { restore().then(() => { if (session.signedIn) load(); }); });
  async function logout() { await signOut(); resetData(); }
  $effect(() => { if (session.signedIn) startAutoRefresh(); else stopAutoRefresh(); });
  $effect(() => { if (session.signedIn && session.checked && !db.loaded && !db.loading) load(); });
  $effect(() => { if (!session.signedIn && db.loaded) resetData(); });
  $effect(() => { route.section; route.page; menuOpen = false; userOpen = false; bellOpen = false; });
</script>

<Toast />
{#if !session.checked}
  <div class="boot" aria-busy="true"><UnextLogo height={28} /><span></span></div>
{:else if !session.signedIn}
  <Login />
{:else}
  <div class="app" class:bleed={fullBleed}>
    <header class="top glass-bar">
      <button class="btn btn-icon btn-ghost menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Open navigation"><Icon name="menu" /></button>
      <a class="brand" href="#/dashboard/overview" aria-label="UNext SupportHub home"><UnextLogo height={24} /><span class="bsep"></span><span><b>SupportHub</b></span></a>
      <nav class="topnav" aria-label="Main">
        {#each nav as s}
          <a href="#/{s.id}/{s.pages[0].id}" class:on={route.section === s.id} class:accent={s.accent}><Icon name={s.icon} size={15} />{s.label}</a>
        {/each}
      </nav>
      <div class="spacer"></div>
      {#if DEMO_NOTICE}<span class="demo-flag" title="Design preview. Sample data only; production data is not connected."><span class="df-full">{DEMO_NOTICE}</span><span class="df-short">Preview</span></span>{/if}
      <div class="pop-wrap">
        <button class="btn btn-icon btn-ghost bell" onclick={() => { bellOpen = !bellOpen; userOpen = false; }} aria-label="Notifications"><Icon name="bell" />{#if pendingCount}<span class="dotn">{pendingCount}</span>{/if}</button>
        {#if bellOpen}
          <div class="pop glass">
            <div class="pop-h"><b>Notifications</b><a href="#/requests/notifications">View all</a></div>
            {#if !db.notifications.length}<div class="pop-i muted">No notifications yet</div>{/if}
            {#each db.notifications.slice(0, 5) as n}
              <a class="pop-i" href="#/requests/queue"><Icon name={n.kind === 'email' ? 'mail' : 'phone'} size={14} /><span><b>{notifText(n).title}</b><small>{notifText(n).sub} · {ago(n.timestamp_utc)}</small></span></a>
            {/each}
          </div>
        {/if}
      </div>
      <div class="pop-wrap">
        <button class="user" onclick={() => { userOpen = !userOpen; bellOpen = false; }} aria-haspopup="menu">
          <span class="avatar u">{initials(session.name)}</span>
          <span class="who"><b>{session.name}</b><small>{session.role === 'admin' ? 'Administrator' : 'Operator'}</small></span>
          <Icon name="down" size={14} />
        </button>
        {#if userOpen}
          <div class="pop glass menu" role="menu">
            <div class="pop-h"><span><b>{session.email}</b><small class="muted">Signed in · 8 h session</small></span></div>
            {#if !LIVE}
            <div class="sw-label">Preview role permissions</div>
            <button class="pop-i" class:on={session.role === 'admin'} onclick={() => signIn('admin')}><Icon name="shieldok" size={14} />Administrator <small>all modules + Settings</small></button>
            <button class="pop-i" class:on={session.role === 'operator'} onclick={() => { signIn('operator'); if (route.section === 'settings') go('dashboard'); }}><Icon name="headset" size={14} />Operator <small>no Settings access</small></button>
            <hr />
            {/if}
            <button class="pop-i" onclick={logout}><Icon name="logout" size={14} />Sign out</button>
          </div>
        {/if}
      </div>
    </header>

    {#if !noSidebar}
      <aside class="side" aria-label="{section.label} pages">
        <div class="side-h">{section.label}</div>
        {#each section.pages as p}
          <a href="#/{section.id}/{p.id}" class:on={route.page === p.id}><Icon name={p.icon} size={16} /><span>{p.label}</span>{#if section.id === 'command' && p.id === 'replacement' && pendingCount}<em>{pendingCount}</em>{/if}</a>
        {/each}
        <div class="side-foot">
          <div class="sync"><span class="live-dot" class:busy={live.busy} class:err={live.error}></span><span>Inventory synced<br /><b>{db.lastSync ? ago(db.lastSync) : '—'}</b><small>{live.error ? 'Refresh failed · showing last data' : `Auto-refresh every ${live.every}s`}</small></span><button class="btn btn-icon btn-ghost btn-sm" aria-label="Refresh now" title="Refresh now" disabled={live.busy} onclick={refresh}><Icon name="refresh" size={13} /></button></div>
        </div>
      </aside>
    {/if}

    <main class="main" class:full={noSidebar} class:bleed={fullBleed}>
      {#if db.error}
        <div class="note bad"><Icon name="alert" />{db.error}<button class="btn btn-sm" onclick={load}>Retry</button></div>
      {:else if !db.loaded}
        <div class="loading"><div class="sk"></div><div class="sk"></div><div class="sk tall"></div></div>
      {:else if blocked}
        <div class="panel panel-pad empty"><Icon name="lock" size={22} /><b>Administrator permission required</b><span>Settings and MCube credentials are restricted to administrators.</span></div>
      {:else}
        {#key route.section + route.page}{#await pagePromise}<div class="page-loading" aria-busy="true"><span></span></div>{:then Page}<div class="page fade-up"><Page /></div>{:catch}<div class="page-loading err">This page could not load. Check the connection and <button class="btn btn-sm" onclick={() => location.reload()}>reload</button></div>{/await}{/key}
      {/if}
    </main>

    {#if menuOpen}
      <div class="m-scrim" onclick={() => (menuOpen = false)} role="presentation"></div>
      <nav class="m-nav glass" aria-label="Mobile">
        {#each nav as s}
          <div class="m-sec"><a href="#/{s.id}/{s.pages[0].id}" class:on={route.section === s.id}><Icon name={s.icon} size={16} />{s.label}</a>
            {#if s.pages.length > 1}<div class="m-pages">{#each s.pages as p}<a href="#/{s.id}/{p.id}" class:on={route.section === s.id && route.page === p.id}>{p.label}</a>{/each}</div>{/if}
          </div>
        {/each}
      </nav>
    {/if}
  </div>
{/if}

<style>
  .boot { min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 18px; }
  .boot span { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
  .sync small { display: block; font-size: 10px; color: var(--faint); font-weight: 500; }
  .live-dot.busy { animation: pulse 1s infinite; } .live-dot.err { background: var(--bad) !important; }
  .page-loading { min-height: 40vh; display: grid; place-items: center; color: var(--muted); font-size: 13px; gap: 8px; }
  .page-loading span { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .app { min-height: 100vh; display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); grid-template-rows: var(--topbar-h) 1fr; }
  .top { grid-column: 1 / -1; position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 10px; padding: 0 16px; height: var(--topbar-h);
    background: rgba(255,255,255,.82); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur); border-bottom: 1px solid rgba(228,232,239,.9); }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 17px; letter-spacing: -.02em; white-space: nowrap; margin-right: 18px; }
  .brand b { font-weight: 750; }
  .bsep { width: 1px; height: 20px; background: var(--line); }
  .topnav { display: flex; gap: 2px; height: 100%; align-items: stretch; }
  .topnav a { display: flex; align-items: center; gap: 7px; padding: 0 12px; font-weight: 600; color: var(--ink-2); font-size: 13px; position: relative; white-space: nowrap; border-radius: 10px; margin: 10px 0; }
  .topnav a:hover { background: rgba(20,26,38,.04); }
  .topnav a.on { color: var(--brand-600); background: var(--brand-50); }
  .topnav a.on::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -10px; height: 2px; border-radius: 2px; background: var(--brand); }
  .menu-btn { display: none; }
  .bell { position: relative; }
  .dotn { position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 9px; background: var(--brand); color: #fff; font-size: 9.5px; font-weight: 700; display: grid; place-items: center; border: 2px solid #fff; }
  .user { display: flex; align-items: center; gap: 9px; border: 0; background: transparent; padding: 4px 6px 4px 4px; border-radius: 12px; }
  .user:hover { background: rgba(20,26,38,.04); }
  .avatar.u { width: 34px; height: 34px; background: linear-gradient(135deg, #3b4456, #141a26); font-size: 12px; }
  .who { display: grid; text-align: left; line-height: 1.2; } .who b { font-size: 13px; } .who small { font-size: 11px; color: var(--muted); }
  .pop-wrap { position: relative; }
  .pop { position: absolute; right: 0; top: calc(100% + 8px); width: 310px; padding: 6px; display: grid; gap: 2px; z-index: 60; background: #fff !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; border: 1px solid var(--line) !important; box-shadow: var(--shadow-lg) !important; }
  .pop-h { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; font-size: 12.5px; }
  .pop-h a { color: var(--brand-600); font-weight: 600; font-size: 12px; }
  .pop-h span { display: grid; }
  .pop-i { display: flex; gap: 9px; align-items: center; padding: 8px 10px; border-radius: 9px; border: 0; background: transparent; text-align: left; font-size: 12.5px; color: var(--ink-2); width: 100%; }
  .pop-i:hover { background: rgba(20,26,38,.05); }
  .pop-i.on { background: var(--brand-50); color: var(--brand-600); font-weight: 600; }
  .pop-i span { display: grid; } .pop-i small { color: var(--muted); font-size: 11px; margin-left: auto; font-weight: 400; }
  .pop-i span small { margin-left: 0; }
  .sw-label { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); padding: 6px 10px 2px; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }

  .side { position: sticky; top: var(--topbar-h); height: calc(100vh - var(--topbar-h)); padding: 14px 10px; display: flex; flex-direction: column; gap: 2px;
    background: rgba(255,255,255,.55); backdrop-filter: var(--blur); border-right: 1px solid rgba(228,232,239,.8); z-index: 5; }
  .side-h { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); padding: 4px 10px 8px; }
  .side a { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; font-weight: 550; color: var(--ink-2); position: relative; }
  .side a:hover { background: rgba(20,26,38,.04); }
  .side a.on { background: var(--brand-grad); color: #fff; box-shadow: 0 8px 18px -8px rgba(242,107,29,.7); }
  .side a em { margin-left: auto; font-style: normal; font-size: 10.5px; font-weight: 700; background: var(--brand-50); color: var(--brand-600); border-radius: 8px; padding: 1px 6px; }
  .side a.on em { background: rgba(255,255,255,.25); color: #fff; }
  .side-foot { margin-top: auto; padding: 10px; }
  .sync { display: flex; gap: 9px; align-items: flex-start; font-size: 11.5px; color: var(--muted); background: rgba(255,255,255,.8); border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
  .sync .live-dot { margin-top: 4px; flex: none; } .sync b { color: var(--ink); }

  .main { padding: var(--gutter); min-width: 0; }
  .main.full { grid-column: 1 / -1; }
  .main.bleed { padding: 0; position: relative; height: calc(100vh - var(--topbar-h)); overflow-y: auto; overflow-x: hidden; }
  .page { min-width: 0; height: 100%; }
  .loading { display: grid; gap: 12px; } .sk { height: 84px; border-radius: 16px; background: linear-gradient(90deg, #eef1f5, #f8f9fb, #eef1f5); background-size: 200% 100%; animation: sh 1.2s infinite; } .sk.tall { height: 320px; }
  @keyframes sh { to { background-position: -200% 0; } }

  .m-scrim { position: fixed; inset: 0; z-index: 70; background: rgba(20,26,38,.3); }
  .m-nav { position: fixed; top: 8px; left: 8px; bottom: 8px; width: min(300px, calc(100vw - 16px)); z-index: 71; padding: 12px; overflow: auto; display: grid; align-content: start; gap: 4px; }
  .m-sec > a { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 10px; font-weight: 650; }
  .m-sec > a.on { background: var(--brand-50); color: var(--brand-600); }
  .m-pages { display: grid; padding: 0 0 6px 36px; } .m-pages a { padding: 6px 8px; border-radius: 8px; color: var(--ink-2); font-size: 12.5px; } .m-pages a.on { color: var(--brand-600); font-weight: 650; }

  @media (max-width: 1360px) { .topnav a { padding: 0 9px; font-size: 12.5px; } .brand { margin-right: 8px; } .who { display: none; } }
  .demo-flag { white-space: nowrap; flex: none; } .df-short { display: none; }
  @media (max-width: 1600px) { .df-full { display: none; } .df-short { display: inline; } }
  @media (max-width: 1180px) { .topnav :global(svg) { display: none; } }
  @media (max-width: 640px) { .demo-flag { display: none; } }
  @media (max-width: 1020px) {
    .app { grid-template-columns: minmax(0, 1fr); grid-template-rows: var(--topbar-h) auto 1fr; }
    .topnav { display: none; } .menu-btn { display: inline-flex; }
    .side { position: sticky; top: var(--topbar-h); height: auto; flex-direction: row; overflow-x: auto; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--line); gap: 4px; scrollbar-width: none; }
    .side::-webkit-scrollbar { display: none; }
    .side-h, .side-foot { display: none; }
    .side a { white-space: nowrap; padding: 7px 11px; font-size: 12.5px; }
    .main.bleed { height: auto; overflow: visible; }
  }
  @media (max-width: 560px) { .brand span { display: none; } .top { padding: 0 10px; gap: 6px; } }
</style>
