<script>
  // Per-app settings: enable/disable an app for everyone (super admin keeps access), maintenance message,
  // and a link to the app's own detailed settings.
  import { getPlatformSettings, savePlatformSettings, listUsers } from '../../lib/data/platform.js';
  import { reloadMe } from '../../lib/session.svelte.js';
  import PageHead from '../../components/PageHead.svelte';
  import Icon from '../../components/Icon.svelte';
  import Badge from '../../components/Badge.svelte';
  import { toast } from '../../components/Toast.svelte';

  const DETAIL = { did: '#/settings/intake' };
  let catalog = $state([]), forms = $state({}), saved = $state({}), counts = $state({}), error = $state(''), busy = $state('');
  async function load() {
    try {
      const [s, u] = await Promise.all([getPlatformSettings(), listUsers().catch(() => ({ users: [] }))]);
      catalog = s.catalog; saved = structuredClone(s.apps); forms = structuredClone(s.apps);
      const c = {}; for (const x of u.users) if (x.status === 'active') for (const a of Object.keys(x.apps)) c[a] = (c[a] || 0) + 1; counts = c;
    } catch (e) { error = e.message; }
  }
  load();
  const on = (v) => String(v) !== 'false';
  const dirty = (id) => JSON.stringify(forms[id]) !== JSON.stringify(saved[id]);
  async function save(id) {
    busy = id;
    try { const s = await savePlatformSettings(id, { enabled: on(forms[id].enabled), maintenance_message: forms[id].maintenance_message || '' }); saved = structuredClone(s.apps); forms = structuredClone(s.apps); toast('App settings saved'); reloadMe(); }
    catch (e) { toast(e.message, 'bad'); } finally { busy = ''; }
  }
</script>

<PageHead title="App Settings" eyebrow="User Management" />
{#if error}<div class="note bad"><Icon name="alert" size={15} />{error}</div>{/if}

<div class="grid">
  {#each catalog as a (a.id)}
    {#if forms[a.id]}
      <div class="panel panel-pad card" style="--c:{a.color}">
        <div class="hd"><span class="ic"><Icon name={a.icon} size={18} /></span><span class="t"><b>{a.name}</b><small>{counts[a.id] || 0} active user{counts[a.id] === 1 ? '' : 's'} with access</small></span>
          {#if a.status === 'planned'}<Badge status="neutral" label="Coming soon" />{:else}<Badge status={on(saved[a.id].enabled) ? 'ok' : 'bad'} label={on(saved[a.id].enabled) ? 'Enabled' : 'Disabled'} />{/if}</div>
        {#if a.status !== 'planned'}
          <label class="tg"><span class="switch"><input type="checkbox" checked={on(forms[a.id].enabled)} disabled={a.id === 'users'} onchange={(e) => (forms[a.id].enabled = e.currentTarget.checked ? 'true' : 'false')} /><span></span></span>
            <span><b>App enabled</b><small>{a.id === 'users' ? 'Always on' : 'When off, only the super administrator can open it'}</small></span></label>
          <label class="field">Message shown when disabled<input class="input" bind:value={forms[a.id].maintenance_message} maxlength="200" placeholder="e.g. Back at 6 PM" /></label>
          <div class="row ft">
            {#if DETAIL[a.id]}<a class="btn btn-sm" href={DETAIL[a.id]}><Icon name="settings" size={13} />{a.name} settings</a>{/if}
            <div class="spacer"></div>
            <button class="btn btn-sm btn-primary" disabled={!dirty(a.id) || busy === a.id} onclick={() => save(a.id)}>{busy === a.id ? 'Saving…' : 'Save'}</button>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
  .card { display: grid; gap: 12px; align-content: start; border-top: 3px solid var(--c); }
  .hd { display: flex; gap: 10px; align-items: center; } .t { display: grid; flex: 1; } .t small { color: var(--muted); font-size: 12px; }
  .ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; color: #fff; background: var(--c); }
  .tg { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; cursor: pointer; }
  .tg > span:last-child { display: grid; font-size: 12.5px; } .tg small { color: var(--muted); }
  .field .input { width: 100%; height: 36px; }
  .ft { align-items: center; }
</style>
