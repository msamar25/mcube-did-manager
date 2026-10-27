<script>
  // Data Setup (DID app, 'Settings' permission):
  //  1. First-time sync — pulls everything from MCube into Google Sheets, step by step.
  //  2. Clear data — empties chosen Google Sheets tabs. Every tab is copied to "Backup <tab> <date>" first.
  import { dataStatus, clearData, syncInventory, syncEmployees, syncCalls, syncHistory, LIVE } from '../lib/data/source.js';
  import { refresh } from '../lib/store.svelte.js';
  import { n } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { toast } from '../components/Toast.svelte';

  const STEPS = [
    { key: 'inventory', label: 'DID inventory from MCube', run: syncInventory, done: (r) => { const c = r?.counts || {}; return c.active !== undefined ? `${n(c.active)} active · ${n(c.pool)} pool · ${n(c.inactive)} inactive` : 'Done'; } },
    { key: 'employees', label: 'Employee directory from MCube', run: syncEmployees, done: (r) => `${n(r?.count ?? r?.employees ?? 0)} employees` },
    { key: 'calls', label: 'Request-line calls from MCube', run: syncCalls, done: (r) => `${n(r?.created ?? 0)} new · ${n(r?.repeated ?? 0)} repeat` },
    { key: 'history', label: 'Replacement history from the change log', run: syncHistory, done: () => 'Done' }
  ];
  let status = $state(null), loadErr = $state(''), picked = $state([]), confirmOpen = $state(false), confirmText = $state(''), busy = $state(false), result = $state(null);
  let steps = $state(STEPS.map((s) => ({ key: s.key, label: s.label, state: 'idle', note: '' })));
  let running = $derived(steps.some((s) => s.state === 'running'));

  async function load() { loadErr = ''; try { status = await dataStatus(); } catch (e) { loadErr = e.message; } }
  load();

  async function runAll(from = 0) {
    for (let i = 0; i < from; i++) if (steps[i].state !== 'ok') steps[i].state = 'idle';
    for (let i = from; i < STEPS.length; i++) {
      steps[i].state = 'running'; steps[i].note = '';
      try { const r = await STEPS[i].run(); steps[i].state = 'ok'; steps[i].note = STEPS[i].done(r); }
      catch (e) { steps[i].state = 'bad'; steps[i].note = e.message; toast(`${STEPS[i].label}: ${e.message}`, 'bad'); return; }
    }
    toast('First-time sync complete'); refresh(true); load();
  }
  const toggle = (g) => (picked = picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g]);
  async function doClear() {
    busy = true;
    try { result = await clearData(picked, confirmText); toast(`Cleared ${result.cleared.reduce((s, x) => s + x.cleared, 0)} rows · backups kept in the sheet`); picked = []; confirmOpen = false; load(); refresh(true); }
    catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  }
</script>

<PageHead title="Data Setup" eyebrow="Settings" />

<div class="grid">
  <section class="panel panel-pad">
    <div class="panel-head"><span class="panel-title"><span class="ico"><Icon name="refresh" size={14} /></span>First-time sync</span>
      <button class="btn btn-primary btn-sm" disabled={running} onclick={() => runAll(0)}><Icon name="play" size={13} />{running ? 'Syncing…' : 'Run all steps'}</button></div>
    <ol class="steps">
      {#each steps as s, i}
        <li class={s.state}>
          <span class="dot">{#if s.state === 'ok'}✓{:else if s.state === 'bad'}!{:else}{i + 1}{/if}</span>
          <span class="tx"><b>{s.label}</b>{#if s.note}<small>{s.note}</small>{/if}</span>
          {#if s.state === 'bad'}<button class="btn btn-sm" onclick={() => runAll(i)}>Retry from here</button>{/if}
        </li>
      {/each}
    </ol>
  </section>

  <section class="panel panel-pad">
    <div class="panel-head"><span class="panel-title"><span class="ico bad"><Icon name="trash" size={14} /></span>Clear data</span>
      <button class="btn btn-danger btn-sm" disabled={!picked.length || running} onclick={() => { confirmText = ''; confirmOpen = true; }}>Clear selected ({picked.length})</button></div>
    {#if loadErr}<div class="note bad"><Icon name="alert" size={14} />{loadErr}<button class="btn btn-sm" onclick={load}>Retry</button></div>
    {:else if !status}<div class="empty">Counting rows…</div>
    {:else}
      <div class="groups">
        {#each status.groups as g}
          <label class="grp" class:on={picked.includes(g.group)}>
            <input type="checkbox" checked={picked.includes(g.group)} onchange={() => toggle(g.group)} />
            <span class="tx"><b>{g.label}</b><small>{g.tabs.map((t) => t.tab).join(' · ')}</small></span>
            <span class="cnt tnum">{n(g.rows)} rows</span>
          </label>
        {/each}
      </div>
      <p class="muted sm">Settings, MCube credentials, users and app access are never cleared. Each tab is copied to a "Backup …" tab first.</p>
    {/if}
    {#if result}
      <div class="note"><Icon name="check" size={14} /><span>{result.cleared.filter((c) => c.cleared).map((c) => `${c.tab}: ${n(c.cleared)}`).join(' · ') || 'Nothing to clear'}</span></div>
    {/if}
  </section>
</div>

<Modal open={confirmOpen} title="Clear selected data" onclose={() => !busy && (confirmOpen = false)}>
  <div class="note bad"><Icon name="alert" size={15} /><span>{picked.map((g) => status?.groups.find((x) => x.group === g)?.label).join(', ')} will be emptied{LIVE ? '' : ' (preview: nothing changes)'}.</span></div>
  <label class="field">Type <span class="mono">{status?.confirmation}</span> to confirm<input class="input mono" bind:value={confirmText} autocomplete="off" /></label>
  {#snippet footer()}<button class="btn" disabled={busy} onclick={() => (confirmOpen = false)}>Cancel</button><button class="btn btn-danger" disabled={busy || confirmText !== status?.confirmation} onclick={doClear}>{busy ? 'Backing up and clearing…' : 'Clear data'}</button>{/snippet}
</Modal>

<style>
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
  .ico.bad { background: var(--bad-50); color: var(--bad); }
  .steps { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
  .steps li { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--line-2); border-radius: 12px; background: #fcfcfd; }
  .dot { width: 26px; height: 26px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 750; background: var(--line-2); color: var(--ink-2); }
  .steps li.running .dot { background: transparent; border: 3px solid var(--line); border-top-color: var(--brand); color: transparent; animation: spin .8s linear infinite; }
  .steps li.ok .dot { background: var(--ok); color: #fff; } .steps li.bad .dot { background: var(--bad); color: #fff; } .steps li.bad { border-color: #f5c2bd; background: var(--bad-50); }
  .tx { display: grid; flex: 1; min-width: 0; } .tx b { font-size: 13px; } .tx small { color: var(--muted); font-size: 11.5px; overflow-wrap: anywhere; }
  .groups { display: grid; gap: 6px; margin-top: 8px; }
  .grp { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--line-2); border-radius: 12px; cursor: pointer; }
  .grp.on { border-color: #f5b5ae; background: var(--bad-50); } .grp input { accent-color: var(--bad); width: 15px; height: 15px; }
  .cnt { font-size: 12px; color: var(--muted); font-weight: 650; white-space: nowrap; }
  .sm { font-size: 12px; margin-top: 8px; }
  .field .input { width: 100%; height: 36px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 960px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
