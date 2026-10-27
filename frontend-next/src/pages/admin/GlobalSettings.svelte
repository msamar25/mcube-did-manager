<script>
  // Global settings: apply to every user and every app.
  import { getPlatformSettings, savePlatformSettings } from '../../lib/data/platform.js';
  import { reloadMe } from '../../lib/session.svelte.js';
  import PageHead from '../../components/PageHead.svelte';
  import Icon from '../../components/Icon.svelte';
  import { toast } from '../../components/Toast.svelte';

  const FIELDS = [
    { key: 'org_name', label: 'Organisation name', hint: 'Shown on the App Launcher' },
    { key: 'session_hours', label: 'Session length (hours)', hint: '1 to 12. Applies to the next sign-in.', type: 'number' },
    { key: 'single_session', label: 'One active session per user', hint: 'A new sign-in signs the user out everywhere else.', toggle: true },
    { key: 'allowed_email_domains', label: 'Allowed email domains for new users', hint: 'Comma separated, e.g. unext.in. Blank allows any.' },
    { key: 'launcher_notice', label: 'Notice on the App Launcher', hint: 'Shown to every user. Blank hides it.' }
  ];
  let saved = $state(null), form = $state(null), busy = $state(false), error = $state('');
  getPlatformSettings().then((s) => { saved = { ...s.global }; form = { ...s.global }; }).catch((e) => (error = e.message));
  let dirty = $derived(form && saved ? FIELDS.filter((f) => String(form[f.key] ?? '') !== String(saved[f.key] ?? '')).map((f) => f.key) : []);
  async function save() {
    busy = true;
    try { const s = await savePlatformSettings('global', Object.fromEntries(dirty.map((k) => [k, String(form[k] ?? '')]))); saved = { ...s.global }; form = { ...s.global }; toast('Global settings saved'); reloadMe(); }
    catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  }
</script>

<PageHead title="Global Settings" eyebrow="User Management" />
{#if error}<div class="note bad"><Icon name="alert" size={15} />{error}</div>{/if}
{#if form}
  <div class="panel panel-pad">
    <div class="fields">
      {#each FIELDS as f}
        {#if f.toggle}
          <label class="tg"><span class="switch"><input type="checkbox" checked={String(form[f.key]) !== 'false'} onchange={(e) => (form[f.key] = e.currentTarget.checked ? 'true' : 'false')} /><span></span></span><span><b>{f.label}</b><small>{f.hint}</small></span></label>
        {:else}
        <label class="field">{f.label}<input class="input" type={f.type || 'text'} min={f.type ? 1 : undefined} max={f.type ? 12 : undefined} bind:value={form[f.key]} /><small>{f.hint}</small></label>
        {/if}
      {/each}
    </div>
    <div class="row ft"><div class="spacer"></div>
      <button class="btn" disabled={!dirty.length || busy} onclick={() => (form = { ...saved })}>Discard</button>
      <button class="btn btn-primary" disabled={!dirty.length || busy} onclick={save}><Icon name="save" size={14} />{busy ? 'Saving…' : 'Save'}</button></div>
  </div>
  <div class="panel panel-pad info">
    <div class="panel-title">Where each setting lives</div>
    <p class="muted"><b>Global</b> (this page) applies to every user and app. <b>Per app</b>: on/off and what each role may do, in <a href="#/admin/apps">App Settings</a>. <b>Per user</b>: apps, role and exceptions, in <a href="#/admin/users">Users & Access</a>. Each app's own settings (e.g. DID Replacement → Settings) stay inside that app.</p>
  </div>
{:else if !error}<div class="panel panel-pad empty">Loading…</div>{/if}

<style>
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
  .field .input { width: 100%; height: 36px; }
  .tg { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; cursor: pointer; align-self: end; }
  .tg > span:last-child { display: grid; font-size: 12.5px; } .tg small { color: var(--muted); }
  .ft { margin-top: 14px; gap: 8px; }
  .info { margin-top: 12px; display: grid; gap: 4px; } .info p { font-size: 12.5px; } .info a { color: var(--brand-600); font-weight: 650; }
  @media (max-width: 760px) { .fields { grid-template-columns: minmax(0, 1fr); } }
</style>
