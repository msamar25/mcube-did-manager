<script>
  // Users & Access: who can sign in, and which apps (with which role) each user can open.
  import { listUsers, saveUser, getPlatformSettings, ROLE_LABEL } from '../../lib/data/platform.js';
  import { session, reloadMe } from '../../lib/session.svelte.js';
  import { ist, initials, avatarColor } from '../../lib/format.js';
  import PageHead from '../../components/PageHead.svelte';
  import DataTable from '../../components/DataTable.svelte';
  import Drawer from '../../components/Drawer.svelte';
  import Badge from '../../components/Badge.svelte';
  import Icon from '../../components/Icon.svelte';
  import { toast } from '../../components/Toast.svelte';

  let users = $state([]), apps = $state([]), loading = $state(true), error = $state('');
  let tab = $state('active'), appFilter = $state('');
  let edit = $state(null), form = $state(null), saving = $state(false);

  let appSettings = $state({});
  async function load() {
    loading = true; error = '';
    try { const [r, st] = await Promise.all([listUsers(), getPlatformSettings().catch(() => ({ apps: {} }))]); users = r.users; apps = r.apps; appSettings = st.apps || {}; } catch (e) { error = e.message; } finally { loading = false; }
  }
  // role default for a permission (App Settings), used to show what "Role default" means
  const byRole = (app, p, role) => String(appSettings[app]?.['perm:' + p.id] ?? p.roles.join(',')).split(',').map((x) => x.trim()).includes(role);
  load();
  let counts = $derived({ active: users.filter((u) => u.status === 'active').length, disabled: users.filter((u) => u.status !== 'active').length });
  let rows = $derived(users.filter((u) => (tab === 'active' ? u.status === 'active' : u.status !== 'active') && (!appFilter || u.apps[appFilter])));
  let columns = $derived([
    { key: 'email', label: 'User', custom: true, lock: true, value: (u) => u.name || u.email, search: (u) => `${u.name} ${u.email}`, export: (u) => u.email, minWidth: '230px' },
    ...apps.map((a) => ({ key: 'app_' + a.id, label: a.name, custom: true, value: (u) => u.apps[a.id] || '', export: (u) => u.apps[a.id] || '' })),
    { key: 'perms', label: 'DID permissions', value: (u) => (u.perms?.did || []).join(', '), format: (v, u) => (u.perms?.did || []).map((x) => apps.find((a) => a.id === 'did')?.permissions?.find((p) => p.id === x)?.label || x).join(', ') || '—', minWidth: '200px' },
    { key: 'source', label: 'Managed in', value: (u) => (u.super_admin ? 'Server environment' : u.source === 'environment' ? 'Server environment' : 'User Management'), format: (v, u) => (u.source === 'environment' ? 'Server environment' : 'User Management') },
    { key: 'status', label: 'Status', custom: true, value: (u) => u.status },
    { key: 'has_pin', label: 'PIN', value: (u) => (u.has_pin ? 'Set' : 'Not set'), format: (v) => (v ? 'Set' : 'Not set') },
    { key: 'updated_utc', label: 'Updated', value: (u) => u.updated_utc || '', format: (v, u) => (u.updated_utc ? `${ist(u.updated_utc)} · ${u.updated_by}` : '—') }
  ]);

  function open(u) {
    edit = u || {};
    form = { email: u?.email || '', display_name: u?.name || '', status: u?.status === 'disabled' ? 'disabled' : 'active', pin: '', default_app: u?.default_app || '', notes: u?.notes || '',
      apps: Object.fromEntries(apps.map((a) => [a.id, u?.apps?.[a.id] || ''])),
      perms: Object.fromEntries(apps.filter((a) => a.permissions?.length).map((a) => [a.id, Object.fromEntries(a.permissions.map((p) => [p.id, u?.overrides?.[a.id]?.[p.id] || '']))])) };
  }
  let isNew = $derived(edit && !edit.email);
  let locked = $derived(!!edit?.super_admin);
  async function save() {
    if (!form.email.trim()) return toast('Enter an email', 'bad');
    if (isNew && !form.pin) return toast('Set a PIN for the new user', 'bad');
    saving = true;
    try {
      const appsOut = { ...form.apps }; if (!session.superAdmin) delete appsOut.users; // only the super admin may change User Management access
      await saveUser({ ...form, apps: appsOut, email: form.email.trim().toLowerCase() });
      toast(isNew ? 'User added' : 'User updated');
      edit = null; await load(); reloadMe();
    } catch (e) { toast(e.message, 'bad'); } finally { saving = false; }
  }
</script>

<PageHead title="Users & Access" eyebrow="User Management">
  {#snippet actions()}<button class="btn btn-primary" onclick={() => open(null)}><Icon name="userplus" size={14} />Add user</button>{/snippet}
</PageHead>

{#if error}<div class="note bad"><Icon name="alert" size={15} />{error}<button class="btn btn-sm" onclick={load}>Retry</button></div>{/if}

<div class="panel panel-pad">
  <div class="bar">
    <div class="seg" role="tablist">
      <button class:on={tab === 'active'} onclick={() => (tab = 'active')}>Active · {counts.active}</button>
      <button class:on={tab === 'disabled'} onclick={() => (tab = 'disabled')}>Disabled · {counts.disabled}</button>
    </div>
    <select class="select af" bind:value={appFilter} aria-label="Filter by app"><option value="">All apps</option>{#each apps as a}<option value={a.id}>{a.name}</option>{/each}</select>
  </div>
  {#if loading && !users.length}<div class="empty">Loading…</div>{:else}
    <DataTable id="platform-users" exportName="users" {rows} {columns} rowKey={(u) => u.email} onrow={open} pageSize={15} placeholder="Search users">
      {#snippet cell(u, c)}
        {#if c.key === 'email'}<span class="who"><span class="av" style="background:{avatarColor(u.name || u.email)}">{initials(u.name || u.email)}</span><span><b>{u.name || u.email.split('@')[0]}</b><small>{u.email}</small></span>{#if u.super_admin}<span class="sa">Super admin</span>{/if}</span>
        {:else if c.key === 'status'}<Badge status={u.status === 'active' ? 'active' : 'inactive'} label={u.status === 'active' ? 'Active' : 'Disabled'} />
        {:else}{@const r = u.apps[c.key.slice(4)]}{#if r}<span class="role">{ROLE_LABEL[r] || r}</span>{:else}<span class="faint">—</span>{/if}{/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<Drawer open={!!edit} title={isNew ? 'Add user' : form?.display_name || form?.email || ''} sub={isNew ? '' : form?.email} onclose={() => (edit = null)} width={480}>
  {#if form}
    {#if locked}<div class="note"><Icon name="lock" size={14} />Super administrator · managed in the server environment.</div>{/if}
    <label class="field">Email<input class="input" type="email" bind:value={form.email} disabled={!isNew} autocomplete="off" /></label>
    <label class="field">Name<input class="input" bind:value={form.display_name} disabled={locked} /></label>
    <label class="field">{isNew ? 'PIN' : 'Reset PIN'}<input class="input" type="password" inputmode="numeric" maxlength="8" bind:value={form.pin} disabled={locked} placeholder={isNew ? '4–8 digits' : 'Leave blank to keep'} autocomplete="new-password" />
      {#if !isNew && edit.source === 'environment' && !locked}<small>Currently set in the server environment. A PIN set here replaces it.</small>{/if}</label>
    <div class="field">Status
      <div class="seg"><button class:on={form.status === 'active'} disabled={locked} onclick={() => (form.status = 'active')}>Active</button><button class:on={form.status === 'disabled'} disabled={locked} onclick={() => (form.status = 'disabled')}>Disabled</button></div>
    </div>
    <div class="field">App access
      <div class="access">
        {#each apps as a}
          <div class="ar"><span class="ic" style="--c:{a.color}"><Icon name={a.icon} size={14} /></span><span class="an"><b>{a.name}</b>{#if a.status === 'planned'}<small>Coming soon</small>{/if}</span>
            <select class="select" bind:value={form.apps[a.id]} disabled={locked || (a.id === 'users' && !session.superAdmin)} aria-label="{a.name} role">
              <option value="">No access</option>{#each a.roles as r}<option value={r}>{ROLE_LABEL[r] || r}</option>{/each}
            </select></div>
          {#if a.permissions?.length && form.apps[a.id]}
            <div class="perms">
              {#each a.permissions as p}
                {@const def = byRole(a.id, p, form.apps[a.id])}
                <div class="pr"><span>{p.label}</span>
                  <select class="select" bind:value={form.perms[a.id][p.id]} disabled={locked} aria-label="{p.label} permission">
                    <option value="">Role default · {def ? 'Yes' : 'No'}</option><option value="allow">Allow</option><option value="deny">Deny</option>
                  </select></div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      {#if !session.superAdmin}<small>Only the super administrator can grant User Management.</small>{/if}
    </div>
    <label class="field">Opens after sign-in<select class="select" bind:value={form.default_app} disabled={locked}><option value="">App Launcher</option>{#each apps.filter((a) => form.apps[a.id] && a.status !== 'planned') as a}<option value={a.id}>{a.name}</option>{/each}</select></label>
    <label class="field">Notes<input class="input" bind:value={form.notes} disabled={locked} maxlength="300" /></label>
    {#if !locked}<div class="row end"><button class="btn" onclick={() => (edit = null)}>Cancel</button><button class="btn btn-primary" disabled={saving} onclick={save}><Icon name="save" size={14} />{saving ? 'Saving…' : 'Save'}</button></div>{/if}
  {/if}
</Drawer>

<style>
  .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .af { width: auto; }
  .who { display: flex; gap: 10px; align-items: center; } .who > span:nth-child(2) { display: grid; } .who small { color: var(--muted); font-size: 11.5px; }
  .av { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; flex: none; }
  .sa { font-size: 10.5px; font-weight: 700; color: var(--brand-600); background: var(--brand-50); border-radius: 7px; padding: 2px 6px; }
  .role { font-size: 11.5px; font-weight: 650; background: var(--info-50); color: #1d55b3; border-radius: 7px; padding: 2px 7px; white-space: nowrap; }
  .faint { color: var(--faint); }
  .field { display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); font-weight: 600; } .field small { color: var(--muted); font-weight: 400; }
  .field .input, .field .select { width: 100%; height: 36px; }
  .access { display: grid; gap: 6px; }
  .ar { display: grid; grid-template-columns: 28px 1fr 150px; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; }
  .an { display: grid; } .an b { font-size: 13px; } .an small { color: var(--faint); font-weight: 500; }
  .ic { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: #fff; background: var(--c); }
  .end { justify-content: flex-end; gap: 8px; }
  .perms { display: grid; gap: 4px; margin: -2px 0 4px 38px; padding: 8px 10px; border-left: 2px solid var(--line); }
  .pr { display: grid; grid-template-columns: 1fr 170px; gap: 8px; align-items: center; font-size: 12px; font-weight: 550; } .pr .select { height: 30px; font-size: 12px; }
</style>
