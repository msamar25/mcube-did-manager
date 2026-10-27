<script>
  // App Launcher: every app this user is allowed to open (from /api/me). Each app is independent.
  import { session } from '../lib/session.svelte.js';
  import { APP_HOME, ROLE_LABEL } from '../lib/data/platform.js';
  import Icon from '../components/Icon.svelte';
  let q = $state('');
  let apps = $derived(session.apps.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q.trim().toLowerCase())));
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (n = '') => n.split(/[\s.]+/)[0];
  const openable = (a) => a.status !== 'planned' && (a.enabled || session.superAdmin);
  function remember(a) { try { localStorage.setItem('next_last_app:' + session.email, a.id); } catch { /* private mode */ } }
</script>

<div class="wrap">
  <div class="hd">
    <div><span class="eyebrow">{session.orgName}</span><h1 class="page-title">{greet}, {first(session.name)}</h1></div>
    <div class="search sr"><Icon name="search" size={14} /><input class="input" placeholder="Search apps" bind:value={q} aria-label="Search apps" /></div>
  </div>
  {#if session.notice}<div class="note warn"><Icon name="info" size={15} /><span>{session.notice}</span></div>{/if}

  <div class="grid">
    {#each apps as a (a.id)}
      {@const ok = openable(a)}
      <svelte:element this={ok ? 'a' : 'div'} class="app panel" class:off={!ok} href={ok ? APP_HOME[a.id] : undefined} onclick={() => ok && remember(a)} style="--c:{a.color}">
        <span class="ic"><Icon name={a.icon} size={22} /></span>
        <span class="tx"><b>{a.name}</b><small>{a.description}</small></span>
        <span class="ft">
          {#if a.status === 'planned'}<span class="tag">Coming soon</span>
          {:else if !a.enabled}<span class="tag bad">Disabled{a.maintenance_message ? ` · ${a.maintenance_message}` : ''}</span>
          {:else}<span class="tag ok">{ROLE_LABEL[a.role] || a.role}</span>{/if}
          {#if ok}<Icon name="right" size={16} />{/if}
        </span>
      </svelte:element>
    {:else}
      <div class="panel panel-pad empty">{session.apps.length ? 'No app matches your search.' : 'No apps are assigned to your account. Ask an administrator for access.'}</div>
    {/each}
  </div>
</div>

<style>
  .wrap { max-width: 1100px; margin: 0 auto; display: grid; gap: 16px; padding-top: 8px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .sr { width: 280px; max-width: 100%; } .sr .input { width: 100%; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
  .app { display: grid; grid-template-rows: auto 1fr auto; gap: 12px; padding: 18px; min-height: 170px; color: inherit; text-decoration: none; transition: transform .15s, box-shadow .15s, border-color .15s; border-top: 3px solid var(--c); }
  a.app:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: color-mix(in srgb, var(--c) 40%, var(--line)); }
  .app.off { opacity: .7; cursor: default; }
  .ic { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, color-mix(in srgb, var(--c) 75%, #fff), var(--c)); box-shadow: 0 10px 20px -10px var(--c); }
  .tx { display: grid; gap: 3px; } .tx b { font-size: 15px; } .tx small { color: var(--muted); font-size: 12.5px; line-height: 1.4; }
  .ft { display: flex; justify-content: space-between; align-items: center; color: var(--muted); }
  .tag { font-size: 11px; font-weight: 650; padding: 3px 8px; border-radius: 8px; background: var(--line-2); color: var(--ink-2); }
  .tag.ok { background: var(--ok-50); color: #067647; } .tag.bad { background: var(--bad-50); color: #b42318; }
</style>
