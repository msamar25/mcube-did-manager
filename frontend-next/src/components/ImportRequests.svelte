<script>
  // Import requests: agent numbers or emails, one per line, plus a required comment (who raised it / why).
  // The backend checks each line against the MCube employee directory and the agent's active DID.
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import { importRequests } from '../lib/data/source.js';
  import { refresh } from '../lib/store.svelte.js';
  import { downloadCsv } from '../lib/format.js';
  import { toast } from './Toast.svelte';
  import { parseImport } from '../lib/reports.js';
  let { open = false, onclose = () => {} } = $props();
  let text = $state(''), comment = $state(''), busy = $state(false), result = $state(null);
  $effect(() => { if (open) { text = ''; comment = ''; result = null; removed = []; } });
  let parsed = $derived(parseImport(text));
  let removed = $state([]);
  let entries = $derived(parsed.entries.filter((e) => !removed.includes(e)));
  async function fromFile(e) {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    if (f.size > 2e6) return toast('File is larger than 2 MB', 'bad');
    text = (text ? text + '\n' : '') + (await f.text()); e.currentTarget.value = '';
  }
  let ok = $derived(entries.length > 0 && entries.length <= 200 && comment.trim().length >= 10);
  async function submit() {
    busy = true;
    try {
      result = await importRequests(entries.slice(0, 200), comment.trim());
      toast(`${result.created.length} imported · ${result.failed.length} failed`, result.failed.length && !result.created.length ? 'bad' : undefined);
      if (result.created.length) refresh();
    } catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  }
</script>

<Modal {open} title="Import requests" width={620} onclose={() => !busy && onclose()}>
  {#if !result}
    <div class="field">Agent numbers or emails <small>Paste anything — split automatically · up to 200</small>
      <textarea class="input" rows="5" bind:value={text} aria-label="Agent numbers or emails" placeholder={'Paste numbers or emails, e.g. 9876500001 9876500002 asha@u-next.com'}></textarea>
      <div class="up"><label class="btn btn-sm"><Icon name="filedown" size={13} />Upload .csv / .txt<input type="file" accept=".csv,.txt,text/csv,text/plain" onchange={fromFile} hidden /></label>{#if text}<button class="btn btn-sm btn-ghost" onclick={() => { text = ''; removed = []; }}>Clear</button>{/if}</div>
    </div>
    {#if entries.length || parsed.invalid.length}
      <div class="chips">
        {#each entries.slice(0, 200) as e (e)}<span class="chip">{e}<button onclick={() => (removed = [...removed, e])} aria-label="Remove {e}">×</button></span>{/each}
        {#each parsed.invalid as d}<span class="chip bad" title="Not a 10-digit mobile number">{d}</span>{/each}
      </div>
      <p class="muted sm">{entries.length} to import{parsed.invalid.length ? ` · ${parsed.invalid.length} not a 10-digit number (skipped)` : ''}{parsed.duplicates ? ` · ${parsed.duplicates} duplicate${parsed.duplicates === 1 ? '' : 's'} removed` : ''}{entries.length > 200 ? ' · only 200 per import' : ''}</p>
    {/if}
    <label class="field">Comment <small>Required · who raised it and why</small>
      <textarea class="input" rows="2" bind:value={comment} maxlength="500" placeholder="e.g. Raised by TL Meena on email, DID not receiving calls"></textarea></label>

  {:else}
    <div class="res">
      <div class="rh ok"><Icon name="ok" size={15} /><b>{result.created.length} imported</b></div>
      {#each result.created as c}<div class="ri"><span class="mono">{c.ticket_no}</span><span>{c.agent_name} · {c.agent_number}</span><span class="mono muted">{c.current_did}</span></div>{/each}
      <div class="rh bad"><Icon name="alert" size={15} /><b>{result.failed.length} failed</b>{#if result.failed.length}<button class="btn btn-sm" onclick={() => downloadCsv(result.failed, 'import-failed.csv')}><Icon name="download" size={12} />CSV</button>{/if}</div>
      {#each result.failed as f}<div class="ri f"><span class="mono">{f.entry}</span><span class="why">{f.reason}</span></div>{/each}
    </div>
  {/if}
  {#snippet footer()}
    {#if result}<button class="btn" onclick={() => (result = null)}>Import more</button><button class="btn btn-primary" onclick={onclose}>Done</button>
    {:else}<button class="btn" disabled={busy} onclick={onclose}>Cancel</button><button class="btn btn-primary" disabled={!ok || busy} onclick={submit}><Icon name="plus" size={14} />{busy ? 'Checking…' : `Import ${entries.length || ''}`}</button>{/if}
  {/snippet}
</Modal>

<style>
  .field { display: grid; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ink-2); } .field small { color: var(--muted); font-weight: 400; margin-left: 4px; }
  textarea.input { width: 100%; height: auto; padding: 8px 10px; resize: vertical; font-family: inherit; }
  .sm { font-size: 12px; }
  .up { display: flex; gap: 6px; } .up label { cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; max-height: 140px; overflow: auto; }
  .chip { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-family: ui-monospace, monospace; padding: 2px 4px 2px 8px; border-radius: 99px; background: var(--brand-50); color: var(--brand-600); border: 1px solid #f8d0b5; }
  .chip button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 13px; padding: 0 3px; }
  .chip.bad { background: var(--bad-50); color: #b42318; border-color: #f5b5ae; padding-right: 8px; text-decoration: line-through; }
  .res { display: grid; gap: 4px; max-height: 55vh; overflow: auto; }
  .rh { display: flex; gap: 8px; align-items: center; padding: 6px 2px; font-size: 13px; } .rh.ok { color: #067647; } .rh.bad { color: #b42318; margin-top: 8px; } .rh .btn { margin-left: auto; }
  .ri { display: grid; grid-template-columns: 150px 1fr auto; gap: 10px; padding: 7px 10px; border-radius: 9px; background: #f8f9fb; font-size: 12.5px; }
  .ri.f { background: var(--bad-50); grid-template-columns: 200px 1fr; } .why { color: #b42318; font-weight: 600; }
</style>
