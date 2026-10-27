<script>
  import { onMount } from 'svelte';
  import { route, go, NAV, ADMIN_NAV, hadHash } from './lib/router.svelte.js';
  import { session, signOut, signIn, restore, hasApp, appOf } from './lib/session.svelte.js';
  import { APP_HOME, ROLE_LABEL } from './lib/data/platform.js';
  import AppSwitcher from './components/AppSwitcher.svelte';
  import { db, load, flowCounts, live, refresh, startAutoRefresh, stopAutoRefresh, resetData, notes, loadSeen, markAllRead, unreadCount } from './lib/store.svelte.js';
  import { DEMO_NOTICE, LIVE, syncInventory } from './lib/data/source.js';
  import { toast } from './components/Toast.svelte';
  import { notifText, parseTs } from './lib/format.js';
  import { ago, initials } from './lib/format.js';
  import Icon from './components/Icon.svelte';
  import UnextLogo from './components/UnextLogo.svelte';
  import Toast from './components/Toast.svelte';
  import WakeScreen from './components/WakeScreen.svelte';
  import { wake, waitForServer, wakeStep } from './lib/wake.svelte.js';
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
    reports: () => import('./pages/Reports.svelte'), settings: () => import('./pages/Settings.svelte'),
    launcher: () => import('./pages/Launcher.svelte'), custom: () => import('./pages/CustomReports.svelte'), users: () => import('./pages/admin/Users.svelte'), appSettings: () => import('./pages/admin/AppSettings.svelte'),
    globalSettings: () => import('./pages/admin/GlobalSettings.svelte'), audit: () => import('./pages/admin/Audit.svelte')
  };
  const PAGES = {
    'command/3d': lazy.command, 'command/inventory': lazy.inventory, 'command/operators': lazy.operators, 'command/pool': lazy.pool,
    'command/agent': lazy.agent, 'command/replacement': lazy.replacement, 'command/risk': lazy.risk,
    'requests/queue': lazy.requests, 'requests/public-form': lazy.form, 'requests/notifications': lazy.notifications,
    'analytics/insights': lazy.insights, 'analytics/teams': lazy.teams,
    'reports/audit': lazy.reports, 'reports/history': lazy.reports, 'reports/exports': lazy.custom,
    'settings/intake': lazy.settings, 'settings/safety': lazy.settings, 'settings/notifications': lazy.settings, 'settings/email': lazy.settings,
    'settings/employees': lazy.settings, 'settings/credentials': lazy.settings, 'settings/advanced': lazy.settings,
    'home/apps': lazy.launcher, 'admin/users': lazy.users, 'admin/apps': lazy.appSettings, 'admin/global': lazy.globalSettings, 'admin/audit': lazy.audit
  };
  const pageCache = new Map();
  function pageFor(key) {
    const loader = PAGES[key]; if (!loader) return Promise.resolve(Dashboard);
    if (!pageCache.has(loader)) pageCache.set(loader, loader().then((m) => m.default).catch((e) => { pageCache.delete(loader); throw e; }));
    return pageCache.get(loader);
  }

  // Each app is independent: its own navigation, data and permissions. home = App Launcher.
  let nav = $derived(route.app === 'did' ? NAV.filter((s) => !s.admin || session.role === 'admin') : route.app === 'users' ? ADMIN_NAV : []);
  let section = $derived(nav.find((s) => s.id === route.section) || nav[0]);
  let appMeta = $derived(appOf(route.app));
  // why the current app can't be opened ('' = it can)
  let denied = $derived(route.app === 'home' ? '' : route.app === 'users' ? (session.canManage ? '' : 'noaccess')
    : !hasApp('did') ? 'noaccess' : !appMeta?.enabled && !session.superAdmin ? 'disabled' : '');
  let didActive = $derived(route.app === 'did' && !denied);
  let blocked = $derived(route.app === 'did' && route.section === 'settings' && session.role !== 'admin');
  let pagePromise = $derived(pageFor(`${route.section}/${route.page}`));
  let fullBleed = $derived(route.section === 'command' && route.page === '3d');
  let noSidebar = $derived(route.section === 'dashboard' || route.app === 'home');
  let menuOpen = $state(false), userOpen = $state(false), bellOpen = $state(false);
  let pendingCount = $derived(flowCounts().pending);
  let unread = $derived(unreadCount());
  $effect(() => { if (session.signedIn && session.checked) loadSeen(); });

  // wait for a sleeping Render backend (with the Preparing-workspace screen), then the session, then the data
  onMount(() => { waitForServer().then(() => restore()).then(() => { if (session.signedIn && didActive) wakeStep('workspace'); else wakeStep('ready'); }); });
  $effect(() => { if (db.loaded || db.error || !didActive) wakeStep('ready'); });
  // First screen after sign-in: the user's default app, the only app they have, or the App Launcher.
  // A deep link (e.g. a page open when the session expired) is kept; otherwise pick the landing app.
  let landed = false, deepLink = hadHash && route.app !== 'home', leaving = false;
  $effect(() => {
    if (!session.signedIn || !session.checked) { if (!session.signedIn && landed) { landed = false; deepLink = !leaving && route.app !== 'home'; leaving = false; } return; }
    if (landed) return; landed = true;
    if (deepLink) return;
    const open = session.apps.filter((a) => a.status !== 'planned' && (a.enabled || session.superAdmin));
    const pick = open.find((a) => a.id === session.defaultApp) || (open.length === 1 ? open[0] : null);
    location.hash = pick && APP_HOME[pick.id] ? APP_HOME[pick.id] : '#/home';
  });
  async function logout() { leaving = true; await signOut(); resetData(); location.hash = '#/home'; }
  // The sidebar button runs a real MCube → Google Sheets inventory sync (POST /api/sync), then reloads the screens.
  let syncing = $state(false);
  async function syncNow() {
    syncing = true;
    try { const r = await syncInventory(); const c = r.counts || {}; toast(c.active !== undefined ? `MCube sync complete · ${c.active} active, ${c.pool} in pool, ${c.inactive} inactive` : 'MCube sync complete'); await refresh(true); }
    catch (e) { toast(e.message, 'bad'); } finally { syncing = false; }
  }
  // Scheduled (cron) inventory sync is considered stale after 60 min during business hours (08:30–23:10 IST).
  let autoStale = $derived.by(() => {
    if (!LIVE) return false;
    const j = db.jobs.find((x) => x.job === 'inventory'); const t = parseTs(j?.last_success_utc)?.getTime() || 0;
    const ist = new Date(Date.now() + 330 * 60e3); const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return m >= 9 * 60 + 30 && m <= 23 * 60 + 10 && Date.now() - t > 60 * 60e3;
  });
  $effect(() => { if (session.signedIn && didActive) startAutoRefresh(); else stopAutoRefresh(); });
  $effect(() => { if (session.signedIn && session.checked && didActive && !db.loaded && !db.loading) load(); });
  $effect(() => { if (!session.signedIn && db.loaded) resetData(); });
  $effect(() => { route.section; route.page; menuOpen = false; userOpen = false; bellOpen = false; });
</script>

<Toast />
{#if wake.show && wake.step !== 'ready'}<WakeScreen />{/if}
{#if !session.checked}
  <div class="boot" aria-busy="true"><UnextLogo height={28} /><span></span></div>
{:else if !session.signedIn}
  <Login />
{:else}
  <div class="app" class:bleed={fullBleed}>
    <header class="top glass-bar">
      <button class="btn btn-icon btn-ghost menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Open navigation"><Icon name="menu" /></button>
      <AppSwitcher />
      <a class="brand" href={route.app === 'home' ? '#/home' : APP_HOME[route.app]} aria-label="{appMeta?.name || 'App Launcher'} home"><UnextLogo height={24} /><span class="bsep"></span><span><b>{route.app === 'home' ? 'Apps' : appMeta?.name || 'SupportHub'}</b></span></a>
      <nav class="topnav" aria-label="Main">
        {#each denied || nav.length < 2 ? [] : nav as s}
          <a href="#/{s.id}/{s.pages[0].id}" class:on={route.section === s.id} class:accent={s.accent}><Icon name={s.icon} size={15} />{s.label}</a>
        {/each}
      </nav>
      <div class="spacer"></div>
      {#if DEMO_NOTICE}<span class="demo-flag" title="Design preview. Sample data only; production data is not connected."><span class="df-full">{DEMO_NOTICE}</span><span class="df-short">Preview</span></span>{/if}
      {#if didActive}
      <div class="pop-wrap">
        <button class="btn btn-icon btn-ghost bell" onclick={() => { bellOpen = !bellOpen; userOpen = false; }} aria-label="Notifications{unread ? `, ${unread} unread` : ''}"><Icon name="bell" />{#if unread}<span class="dotn">{unread > 99 ? '99+' : unread}</span>{/if}</button>
        {#if bellOpen}
          <div class="pop glass">
            <div class="pop-h"><b>Notifications</b><span class="ph-act">{#if unread}<button class="lnkb" onclick={markAllRead}>Mark all as read</button>{/if}<a href="#/requests/notifications">View all</a></span></div>
            {#if !db.notifications.length}<div class="pop-i muted">No notifications yet</div>{/if}
            {#each db.notifications.slice(0, 5) as n}
              <a class="pop-i" class:unread={(parseTs(n.timestamp_utc)?.getTime() || 0) > notes.seen} href="#/requests/notifications"><Icon name={n.kind === 'email' ? 'mail' : n.kind === 'review' ? 'check' : 'phone'} size={14} /><span><b>{notifText(n).title}</b><small>{notifText(n).sub} · {ago(n.timestamp_utc)}</small></span></a>
            {/each}
          </div>
        {/if}
      </div>
      {/if}
      <div class="pop-wrap">
        <button class="user" onclick={() => { userOpen = !userOpen; bellOpen = false; }} aria-haspopup="menu">
          <span class="avatar u">{initials(session.name)}</span>
          <span class="who"><b>{session.name}</b><small>{route.app === 'home' ? session.orgName : ROLE_LABEL[appMeta?.role] || ''}</small></span>
          <Icon name="down" size={14} />
        </button>
        {#if userOpen}
          <div class="pop glass menu" role="menu">
            <div class="pop-h"><span><b>{session.email}</b><small class="muted">{session.superAdmin ? 'Super administrator · ' : ''}{session.sessionHours} h session</small></span></div>
            <a class="pop-i" href="#/home"><Icon name="grid" size={14} />App Launcher</a>
            {#if session.canManage}<a class="pop-i" href="#/admin/users"><Icon name="users" size={14} />User Management</a>{/if}
            <hr />
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

    {#if !noSidebar && section && !denied}
      <aside class="side" aria-label="{section.label} pages">
        <div class="side-h">{section.label}</div>
        {#each section.pages as p}
          <a href="#/{section.id}/{p.id}" class:on={route.page === p.id}><Icon name={p.icon} size={16} /><span>{p.label}</span>{#if section.id === 'command' && p.id === 'replacement' && pendingCount}<em>{pendingCount}</em>{/if}</a>
        {/each}
        {#if didActive}<div class="side-foot">
          <div class="sync" class:warn={autoStale}><span class="live-dot" class:busy={syncing || live.busy} class:err={live.error || autoStale}></span><span>Inventory synced<br /><b>{db.lastSync ? ago(db.lastSync) : '—'}</b><small>{syncing ? 'Syncing with MCube…' : live.error ? 'Refresh failed · showing last data' : autoStale ? 'Automatic sync not running' : `Screen refreshes every ${live.every / 60} min`}</small></span><button class="btn btn-icon btn-ghost btn-sm" aria-label="Sync inventory from MCube now" title="Sync inventory from MCube now" disabled={syncing} onclick={syncNow}><Icon name="refresh" size={13} /></button></div>
        </div>{/if}
      </aside>
    {/if}

    <main class="main" class:full={noSidebar || !section || denied} class:bleed={fullBleed}>
      {#if denied}
        <div class="panel panel-pad empty"><Icon name="lock" size={22} /><b>{denied === 'disabled' ? `${appMeta?.name} is disabled` : 'No access to this app'}</b><span>{denied === 'disabled' ? appMeta?.maintenance_message || 'An administrator has turned this app off.' : 'Ask an administrator to grant access.'}</span><a class="btn btn-sm" href="#/home">App Launcher</a></div>
      {:else if route.app !== 'did'}
        {#key route.section + route.page}{#await pagePromise}<div class="page-loading" aria-busy="true"><span></span></div>{:then Page}<div class="page fade-up"><Page /></div>{:catch}<div class="page-loading err">This page could not load. <button class="btn btn-sm" onclick={() => location.reload()}>Reload</button></div>{/await}{/key}
      {:else if db.error}
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
  .sync.warn { border-color: #f4cf8f !important; background: var(--warn-50) !important; }
  .ph-act { display: flex; gap: 12px; align-items: center; } .lnkb { border: 0; background: none; padding: 0; font: inherit; font-size: 12px; font-weight: 650; color: var(--brand-600); cursor: pointer; }
  .pop-i.unread { background: var(--brand-50, #fff4ec); } .pop-i.unread b::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); margin-right: 6px; vertical-align: 1px; }
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
