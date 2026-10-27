<script>
  // Waffle button + App Launcher popover (top-left of every app).
  import Icon from './Icon.svelte';
  import { session } from '../lib/session.svelte.js';
  import { APP_HOME } from '../lib/data/platform.js';
  import { route } from '../lib/router.svelte.js';
  let open = $state(false), q = $state(''), input = $state();
  let apps = $derived(session.apps.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())));
  const ok = (a) => a.status !== 'planned' && (a.enabled || session.superAdmin);
  $effect(() => { route.section; route.page; open = false; });
  $effect(() => { if (open) { q = ''; setTimeout(() => input?.focus(), 0); } });
  function remember(a) { try { localStorage.setItem('next_last_app:' + session.email, a.id); } catch { /* private mode */ } }
</script>
<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />
<div class="aw">
  <button class="btn btn-icon btn-ghost wf" onclick={() => (open = !open)} aria-label="App Launcher" aria-expanded={open} title="App Launcher"><Icon name="waffle" size={20} /></button>
  {#if open}
    <div class="scrim" onclick={() => (open = false)} role="presentation"></div>
    <div class="pop" role="dialog" aria-label="App Launcher">
      <div class="ph"><b>App Launcher</b><button class="btn btn-icon btn-ghost btn-sm" onclick={() => (open = false)} aria-label="Close"><Icon name="x" size={15} /></button></div>
      <div class="search s"><Icon name="search" size={14} /><input class="input" bind:this={input} bind:value={q} placeholder="Search apps" aria-label="Search apps" /></div>
      <div class="lbl">Apps</div>
      <div class="list">
        {#each apps as a (a.id)}
          {#if ok(a)}
            <a class="it" class:on={route.app === a.id} href={APP_HOME[a.id]} onclick={() => remember(a)}><span class="ic" style="--c:{a.color}"><Icon name={a.icon} size={15} /></span>{a.name}{#if !a.enabled}<small class="bad">disabled</small>{/if}</a>
          {:else}
            <div class="it dim"><span class="ic" style="--c:{a.color}"><Icon name={a.icon} size={15} /></span>{a.name}<small>{a.status === 'planned' ? 'Coming soon' : 'Disabled'}</small></div>
          {/if}
        {:else}<div class="it dim">No apps</div>{/each}
      </div>
      <a class="all" href="#/home">View all</a>
    </div>
  {/if}
</div>
<style>
  .aw { position: relative; }
  .wf { color: var(--ink-2); }
  .scrim { position: fixed; inset: 0; z-index: 59; }
  .pop { position: absolute; left: 0; top: calc(100% + 10px); width: 300px; z-index: 60; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-lg); padding: 10px; display: grid; gap: 6px; }
  .ph { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; } .ph b { font-size: 15px; }
  .s .input { width: 100%; }
  .lbl { font-size: 11px; font-weight: 700; color: var(--faint); text-transform: uppercase; letter-spacing: .08em; padding: 4px 6px 0; }
  .list { display: grid; gap: 1px; max-height: 50vh; overflow: auto; }
  .it { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 9px; font-size: 13.5px; font-weight: 550; color: var(--ink); }
  a.it:hover { background: #f5f6f9; } .it.on { background: var(--brand-50); }
  .it small { margin-left: auto; font-size: 11px; color: var(--faint); font-weight: 500; } .it small.bad { color: var(--bad); }
  .it.dim { color: var(--muted); }
  .ic { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; background: var(--c); flex: none; }
  .all { padding: 8px 6px 4px; font-size: 13px; font-weight: 650; color: var(--brand-600); border-top: 1px solid var(--line); }
</style>
