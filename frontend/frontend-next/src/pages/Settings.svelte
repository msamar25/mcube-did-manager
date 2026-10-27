<script>
  // Same keys and labels as the production settings (workflows.DEFAULTS); admin-only.
  import { route } from '../lib/router.svelte.js';
  import { getSettings, getSettingsHistory, saveSettings, syncEmployees, credentialStatus, saveCredentials, testCredentials, clearInventory, getRecovery, acknowledgeRecovery, LIVE } from '../lib/data/source.js';
  import { db, refresh } from '../lib/store.svelte.js';
  import { ist, ago } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Badge from '../components/Badge.svelte';
  import Modal from '../components/Modal.svelte';
  import { toast } from '../components/Toast.svelte';

  const SECTIONS = {
    intake: { title: 'Request Intake', sub: 'How replacement requests are detected from MCube calls', fields: [
      { key: 'request_did', label: 'Replacement request DID', hint: 'Provider filter-inbound DID. Saved in Google Sheets.' },
      { key: 'sync_mode', label: 'Request synchronization', options: [['login', 'On login + scheduled'], ['scheduled', 'Scheduled only'], ['manual', 'Manual only']] },
      { key: 'auto_calls_minutes', label: 'Automatic request-call sync (minutes)', numeric: true, min: 1 },
      { key: 'request_sync_lookback_minutes', label: 'Call sync lookback (minutes)', numeric: true, min: 1 },
      { key: 'call_page_size', label: 'Call-log page size', numeric: true, min: 1 }
    ] },
    safety: { title: 'Replacement Safety', sub: 'Guards applied before any DID is reassigned', fields: [
      { key: 'require_recent_review', label: 'Require review if replaced recently', toggle: true },
      { key: 'recent_replacement_days', label: 'Recent replacement warning (days)', numeric: true, min: 1 },
      { key: 'auto_inventory_minutes', label: 'Automatic DID inventory refresh (minutes)', numeric: true, min: 1 }
    ] },
    notifications: { title: 'Call Notifications', sub: 'MCube click-to-call alerts for the queue and agents', fields: [
      { key: 'notify_on_queue', label: 'Call Level 1 on new queue entry', toggle: true },
      { key: 'notify_level2_on_queue', label: 'Also call Level 2 on new queue entry', toggle: true },
      { key: 'notify_on_completion', label: 'Call agent after replacement (agent mobile as exenumber)', toggle: true },
      { key: 'level1_exenumber', label: 'Level 1 exenumber (provider registered agent mobile)' },
      { key: 'level1_custnumber', label: 'Level 1 custnumber (destination)' },
      { key: 'level2_exenumber', label: 'Level 2 exenumber (provider registered agent mobile)' },
      { key: 'level2_custnumber', label: 'Level 2 custnumber (destination)' },
      { key: 'agent_notification_custnumber', label: 'Agent notification custnumber (defaults to request DID)' },
      { key: 'reminder_enabled', label: 'Enable periodic reminder calls', toggle: true },
      { key: 'reminder_first_minutes', label: 'First reminder delay (minutes)', numeric: true },
      { key: 'reminder_interval_minutes', label: 'Repeat interval (minutes)', numeric: true },
      { key: 'reminder_escalation_minutes', label: 'Escalation delay (minutes)', numeric: true },
      { key: 'reminder_max_attempts', label: 'Maximum attempts', numeric: true },
      { key: 'first_contact_number', label: 'Legacy first contact', legacy: true },
      { key: 'second_contact_number', label: 'Legacy second contact', legacy: true },
      { key: 'outbound_caller_number', label: 'Legacy outbound caller', legacy: true }
    ] },
    email: { title: 'Email', sub: 'Transactional email via Brevo', fields: [
      { key: 'mail_provider', label: 'Mail provider', options: [['brevo', 'Brevo']] },
      { key: 'mail_from', label: 'Notification sender address' },
      { key: 'admin_email', label: 'Administrator notification email' },
      { key: 'email_on_queue', label: 'Email agent when queued', toggle: true },
      { key: 'email_on_completion', label: 'Email agent when completed', toggle: true }
    ] },
    employees: { title: 'Employee Sync', sub: 'Employee_Directory refresh from MCube (all roles)', fields: [
      { key: 'auto_employee_minutes', label: 'Automatic employee directory sync (minutes)', numeric: true, min: 1 },
      { key: 'employee_refresh_hours', label: 'Legacy employee refresh interval (hours)', numeric: true, min: 1, legacy: true }
    ] },
    credentials: { title: 'MCube Credentials', sub: 'Stored encrypted on the server; never sent to the browser', fields: [] },
    advanced: { title: 'Advanced & Access', sub: 'Scheduled jobs, access log, settings history and recovery', fields: [] }
  };
  let sec = $derived(SECTIONS[route.page] || SECTIONS.intake);
  let original = $state(null), form = $state(null), history = $state([]);
  let user = $state(''), pass = $state(''), credBusy = $state(false), reset = $state(false), resetText = $state('');
  let version = $state(null), saving = $state(false), loadErr = $state(''), credOk = $state(null), busy = $state('');
  let unresolved = $state([]), ackNote = $state(''), ackFor = $state(null);
  const NUMERIC = new Set(Object.values(SECTIONS).flatMap((x) => x.fields).filter((f) => f.numeric).map((f) => f.key));
  async function loadAll() {
    try { const s = await getSettings(); original = { ...s.settings }; form = { ...s.settings }; version = s.version; loadErr = ''; }
    catch (e) { loadErr = e.message; }
    getSettingsHistory().then((h) => (history = h.items)).catch(() => {});
    credentialStatus().then((c) => (credOk = !!c.configured)).catch(() => (credOk = null));
    getRecovery().then((r) => (unresolved = r.unresolved || [])).catch(() => {});
  }
  loadAll();
  let staleAuto = $derived(Date.now() - (Date.parse(String(db.jobs.find((j) => j.job === 'inventory')?.last_success_utc || '')) || 0) > 60 * 60e3);
  let dirty = $derived(form && original ? Object.keys(form).filter((k) => String(form[k]) !== String(original[k])) : []);
  // The backend validates types strictly: numbers must be whole numbers, toggles booleans.
  async function save() {
    const changes = {};
    for (const k of dirty) changes[k] = NUMERIC.has(k) ? Math.trunc(Number(form[k])) : form[k];
    if (Object.entries(changes).some(([k, v]) => NUMERIC.has(k) && (!Number.isFinite(v) || v < 1))) return toast('Numbers must be whole numbers of 1 or more', 'bad');
    saving = true;
    try { const r = await saveSettings(changes, version); toast(`Saved ${r.changed ?? dirty.length} change${(r.changed ?? dirty.length) === 1 ? '' : 's'} to Google Sheets`); await loadAll(); }
    catch (e) { toast(e.status === 409 ? 'Settings were changed elsewhere. Reloaded the latest values; please re-apply your change.' : e.message, 'bad'); if (e.status === 409) await loadAll(); }
    finally { saving = false; }
  }
  async function act(name, fn, ok) { busy = name; try { const r = await fn(); toast(ok(r)); refresh(true); } catch (e) { toast(e.message, 'bad'); } finally { busy = ''; } }
</script>

<PageHead title={sec.title} eyebrow="Settings" />

{#if loadErr}<div class="panel panel-pad empty"><Icon name="alert" size={16} /> {loadErr} <button class="btn btn-sm" onclick={loadAll}>Retry</button></div>
{:else if !form}<div class="panel panel-pad empty">Loading settings…</div>{:else}
  {#if sec.fields.length}
    <div class="panel panel-pad">
      <div class="fields">
        {#each sec.fields as f}
          <div class="f" class:legacy={f.legacy} class:wide={f.toggle}>
            {#if f.toggle}
              <label class="tg"><span class="switch"><input type="checkbox" bind:checked={form[f.key]} /><span></span></span><span><b>{f.label}</b>{#if f.hint}<small>{f.hint}</small>{/if}</span></label>
            {:else}
              <label class="field">{f.label}{#if f.legacy}<span class="badge">Legacy</span>{/if}
                {#if f.options}<select class="select" bind:value={form[f.key]}>{#each f.options as [v, l]}<option value={v}>{l}</option>{/each}</select>
                {:else if f.numeric}<input class="input" type="number" min={f.min} bind:value={form[f.key]} />
                {:else}<input class="input" bind:value={form[f.key]} placeholder="Not set" />{/if}
                {#if f.hint}<small>{f.hint}</small>{/if}
              </label>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    {#if route.page === 'safety'}
      <div class="panel panel-pad danger">
        <div><b>Clear inventory snapshots</b><p class="muted">Inventory snapshots only. Logs, requests and settings are kept.</p></div>
        <button class="btn btn-danger" onclick={() => { reset = true; resetText = ''; }}>Clear snapshots…</button>
      </div>
    {/if}
    {#if route.page === 'employees'}
      <div class="panel panel-pad danger"><div><b>Sync employee directory now</b><p class="muted">Last success {ago(db.jobs.find((j) => j.job === 'employees')?.last_success_utc)}.</p></div><button class="btn" disabled={busy === 'emp'} onclick={() => act('emp', syncEmployees, (r) => `Employee directory synced · ${r.count ?? 0} people${r.sheet_updated === false ? ' (no changes)' : ''}`)}><Icon name="refresh" size={14} />{busy === 'emp' ? 'Syncing…' : 'Sync now'}</button></div>
    {/if}
  {:else if route.page === 'credentials'}
    <div class="grid1">
      <div class="panel panel-pad cred">
        <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="key" size={14} /></span>MCube configuration login</span>{#if credOk === null}<Badge status="pending" label="Unknown" />{:else}<Badge status={credOk ? 'ok' : 'bad'} label={credOk ? 'Configured' : 'Not configured'} />{/if}</div>
        <label class="field">MCube username<input class="input" bind:value={user} autocomplete="off" placeholder="Leave blank to keep current" /></label>
        <label class="field">MCube password<input class="input" type="password" bind:value={pass} autocomplete="new-password" placeholder="Leave blank to keep current" /></label>
        <div class="row"><button class="btn btn-primary" disabled={!user || !pass || busy === 'cred'} onclick={() => act('cred', () => saveCredentials(user, pass), () => { user = pass = ''; credOk = true; return 'MCube credentials saved (encrypted on the server)'; })}>Save credentials</button>
          <button class="btn" disabled={credBusy} onclick={async () => { credBusy = true; try { await testCredentials(); toast('MCube login succeeded'); } catch (e) { toast(e.message, 'bad'); } finally { credBusy = false; } }}>{credBusy ? 'Testing…' : 'Test connection'}</button></div>
      </div>
    </div>
  {:else}
    <div class="grid2">
      <div class="panel panel-pad">
        <div class="panel-title" style="margin-bottom:8px">Scheduled jobs</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Job</th><th>Last success</th><th>Status</th></tr></thead>
          <tbody>{#each db.jobs as j}<tr><td class="strong">{j.label}</td><td>{ago(j.last_success_utc)}</td><td><Badge status={/^succ/i.test(j.status) ? 'ok' : /running/i.test(j.status) ? 'pending' : 'bad'} label={j.status} /></td></tr>{:else}<tr><td colspan="3" class="muted">No scheduled job has run yet.</td></tr>{/each}</tbody></table></div>
        {#if staleAuto}<div class="note bad" style="margin-top:8px"><Icon name="alert" size={14} /><span><b>Automatic sync is not running.</b> Last scheduled inventory sync {ago(db.jobs.find((j) => j.job === 'inventory')?.last_success_utc)}. Set up the cron job (V86-AUTO-SYNC.md).</span></div>{/if}
              </div>
      <div class="panel panel-pad">
        <div class="panel-title" style="margin-bottom:8px">Settings history</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>When</th><th>Key</th><th>Change</th></tr></thead>
          <tbody>{#each history as h}<tr><td>{ist(h.timestamp_utc)}</td><td class="mono">{h.key}</td><td>{h.old_value} → <b>{h.new_value}</b></td></tr>{:else}<tr><td colspan="3" class="muted">No changes recorded.</td></tr>{/each}</tbody></table></div>
      </div>
      <div class="panel panel-pad span">
        <div class="panel-title" style="margin-bottom:8px">Replacement recovery</div>
        {#if !unresolved.length}<div class="note"><Icon name="shieldok" size={14} />No unfinished batches.</div>
        {:else}
          <div class="note bad"><Icon name="alert" size={14} /><span><b>{unresolved.length} unfinished batch{unresolved.length === 1 ? '' : 'es'}.</b> Replacements are blocked until each is checked in MCube and acknowledged.</span></div>
          {#each unresolved as u}
            <div class="rec"><span class="mono">{u.batch_id}</span><span class="muted">started {ist(u.started)} · last step {u.last_event}</span><button class="btn btn-sm" onclick={() => { ackFor = u; ackNote = ''; }}>Acknowledge…</button></div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  {#if dirty.length}
    <div class="savebar glass fade-up"><Icon name="info" size={15} /><span><b>{dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}</b> · {dirty.join(', ')}</span><div class="spacer"></div>
      <button class="btn" onclick={() => (form = { ...original })} disabled={saving}>Discard</button><button class="btn btn-primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
  {/if}
{/if}

<Modal open={reset} title="Clear inventory snapshots" onclose={() => (reset = false)}>
  <div class="note bad"><Icon name="alert" size={15} />Run an MCube sync right after. Replacements wait until inventory is re-synced.</div>
  <label class="field">Type <span class="mono">CLEAR_INVENTORY_SNAPSHOTS_ONLY</span> to confirm<input class="input mono" bind:value={resetText} /></label>
  {#snippet footer()}<button class="btn" onclick={() => (reset = false)}>Cancel</button><button class="btn btn-primary" disabled={resetText !== 'CLEAR_INVENTORY_SNAPSHOTS_ONLY'} onclick={() => { reset = false; act('clear', clearInventory, (r) => r.message || 'Inventory snapshots cleared. Run a fresh MCube sync now.'); }}>Clear snapshots</button>{/snippet}
</Modal>

<Modal open={!!ackFor} title="Acknowledge unfinished batch" onclose={() => (ackFor = null)}>
  <div class="note bad"><Icon name="alert" size={15} />Continue only after checking the agent's DID in MCube.</div>
  <p class="mono small">{ackFor?.batch_id}</p>
  <label class="field">What did you check and change? (at least 12 characters)<textarea class="input" rows="3" bind:value={ackNote} maxlength="500"></textarea></label>
  {#snippet footer()}<button class="btn" onclick={() => (ackFor = null)}>Cancel</button><button class="btn btn-primary" disabled={ackNote.trim().length < 12 || busy === 'ack'} onclick={() => { const id = ackFor.batch_id; ackFor = null; act('ack', () => acknowledgeRecovery(id, ackNote.trim()), () => { getRecovery().then((r) => (unresolved = r.unresolved || [])); return 'Batch acknowledged. Replacements are allowed again.'; }); }}>I verified MCube · acknowledge</button>{/snippet}
</Modal>

<style>
  .rec { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 0; border-top: 1px solid var(--line-2); font-size: 12px; } .rec .btn { margin-left: auto; }
  .small { font-size: 11.5px; } textarea.input { height: auto; padding: 8px 10px; resize: vertical; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
  .f.wide { grid-column: span 1; }
  .f .input, .f .select { width: 100%; height: 36px; }
  .f.legacy { opacity: .75; }
  .tg { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; cursor: pointer; }
  .tg span:last-child { display: grid; font-size: 12.5px; } .tg small { color: var(--muted); }
  .danger { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 12px; flex-wrap: wrap; } .danger p { font-size: 12px; margin-top: 2px; max-width: 640px; }
  .grid1 { max-width: 560px; }
  .grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .span { grid-column: 1 / -1; }
  .cred { display: grid; gap: 12px; } .cred .input { width: 100%; height: 36px; }
  .kv { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line-2); font-size: 12px; }
  code { font-size: 11.5px; background: rgba(0,0,0,.05); padding: 1px 4px; border-radius: 4px; }
  .savebar { position: sticky; bottom: 12px; margin-top: 12px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 12.5px; z-index: 10; }
  @media (max-width: 800px) { .fields, .grid2 { grid-template-columns: minmax(0, 1fr); } .savebar span { display: none; } }
</style>
