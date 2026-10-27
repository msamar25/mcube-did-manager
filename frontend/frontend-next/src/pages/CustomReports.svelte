<script>
  // Custom reports: pick a dataset, columns, date range, filters, grouping and sort; save (private or
  // shared with the team) and export. Definitions are stored in Platform_Saved_Reports.
  import { db } from '../lib/store.svelte.js';
  import { DATASETS, TEMPLATES, OPS, runReport, display } from '../lib/reports.js';
  import { listReports, saveReport, deleteReport } from '../lib/data/platform.js';
  import { getLogsSince, historyFrom } from '../lib/data/source.js';
  import { rangeBounds, daysNeeded } from '../lib/calc.js';
  import { n } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Icon from '../components/Icon.svelte';
  import { toast } from '../components/Toast.svelte';

  const RANGES = [['all', 'All time'], ['24h', '24 h'], ['7d', '7 days'], ['15d', '15 days'], ['30d', '30 days'], ['custom', 'Custom']];
  const blank = (dataset = 'requests') => ({ id: '', name: '', shared: false, dataset, config: { cols: [...DATASETS[dataset].cols], filters: [], range: { preset: DATASETS[dataset].date ? '30d' : 'all', from: '', to: '' }, group: '', sort: DATASETS[dataset].date || '', dir: -1 } });
  let saved = $state([]), rep = $state(blank()), dirty = $state(false), busy = $state(false);
  let extraLogs = $state(null); // full Change_Logs rows for long ranges
  listReports().then((r) => (saved = r.items)).catch(() => {});

  let ds = $derived(DATASETS[rep.dataset]);
  let fields = $derived(ds.fields);
  function source(id) {
    const logs = extraLogs || db.logs;
    return { inventory: db.inventory, requests: db.requests, logs, history: extraLogs ? historyFrom(extraLogs, db.inventory) : db.history, notifications: db.notifications, employees: db.employees }[id] || [];
  }
  // long ranges over the journal need every row of the period (not only the latest 500)
  $effect(() => {
    const r = rep.config.range;
    if (!['logs', 'history'].includes(rep.dataset) || !r || r.preset === '24h') return;
    loadLogs(r.preset === 'all' ? 120 : [7, 15, 30, 60, 90, 120].find((x) => x >= daysNeeded(rangeBounds(r))) || 120);
  });
  let loadedDays = 0;
  async function loadLogs(days) { if (loadedDays >= days) return; try { const r = await getLogsSince(days); extraLogs = r.items; loadedDays = days; } catch { /* fall back to loaded rows */ } }

  let result = $derived(runReport(rep.dataset, source(rep.dataset), rep.config));
  let columns = $derived(rep.config.cols.map((k) => fields.find((f) => f.key === k)).filter(Boolean).map((f) => ({ key: f.key, label: f.label, value: (r) => (f.type === 'date' ? r[f.key] || '' : r[f.key]), format: (v) => display(f, v) || '—', export: (r) => display(f, r[f.key]), mono: /did|number|batch|ticket/.test(f.key) })));
  const groupCols = [{ key: 'value', label: 'Value', strong: true }, { key: 'count', label: 'Rows', num: true }, { key: 'share', label: 'Share %', num: true }];

  function touch() { dirty = true; }
  function pickDataset(id) { const nm = rep.name; rep = blank(id); rep.name = nm; extraLogs = null; loadedDays = 0; touch(); }
  function load(r) { rep = { id: r.mine ? r.id : '', name: r.name, shared: !!r.shared, dataset: r.dataset, config: { ...blank(r.dataset).config, ...structuredClone(r.config || {}) } }; extraLogs = null; loadedDays = 0; dirty = false; }
  function toggleCol(k) { const c = rep.config.cols; rep.config.cols = c.includes(k) ? c.filter((x) => x !== k) : [...c, k]; touch(); }
  function move(k, dir) { const c = [...rep.config.cols], i = c.indexOf(k), j = i + dir; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; rep.config.cols = c; touch(); }
  function addFilter() { rep.config.filters = [...rep.config.filters, { field: fields[0].key, op: 'contains', value: '' }]; touch(); }
  async function save() {
    if (!rep.name.trim()) return toast('Name the report first', 'bad');
    busy = true;
    try { const r = await saveReport({ id: rep.id, name: rep.name.trim(), dataset: rep.dataset, app_id: 'did', shared: rep.shared, config: rep.config }); rep.id = r.id; dirty = false; saved = (await listReports()).items; toast('Report saved'); }
    catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  }
  async function remove() {
    if (!rep.id) return;
    busy = true;
    try { await deleteReport(rep.id); saved = (await listReports()).items; rep = blank(); dirty = false; toast('Report deleted'); } catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  }
</script>

<PageHead title="Custom Reports" eyebrow="Reports" />

<div class="layout">
  <aside class="panel panel-pad rlist">
    <button class="btn btn-primary" onclick={() => { rep = blank(); dirty = false; }}><Icon name="plus" size={14} />New report</button>
    <div class="lbl">Saved</div>
    {#each saved as r (r.id)}<button class="it" class:on={rep.id === r.id} onclick={() => load(r)}><Icon name="file" size={14} /><span><b>{r.name}</b><small>{DATASETS[r.dataset]?.label}{r.shared ? ' · shared' : ''}{r.mine ? '' : ` · ${r.owner}`}</small></span></button>
    {:else}<div class="muted sm">None yet</div>{/each}
    <div class="lbl">Templates</div>
    {#each TEMPLATES as tp}<button class="it" onclick={() => load({ ...tp, mine: false })}><Icon name="sparkles" size={14} /><span><b>{tp.name}</b><small>{DATASETS[tp.dataset].label}</small></span></button>{/each}
  </aside>

  <section class="main">
    <div class="panel panel-pad builder">
      <div class="row1">
        <label class="field">Report name<input class="input" bind:value={rep.name} oninput={touch} placeholder="Untitled report" maxlength="80" /></label>
        <label class="field">Data<select class="select" value={rep.dataset} onchange={(e) => pickDataset(e.currentTarget.value)}>{#each Object.entries(DATASETS) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></label>
        {#if ds.date}
          <div class="field">Date range
            <div class="rg"><select class="select" bind:value={rep.config.range.preset} onchange={touch}>{#each RANGES as [k, l]}<option value={k}>{l}</option>{/each}</select>
              {#if rep.config.range.preset === 'custom'}<input class="input" type="date" bind:value={rep.config.range.from} onchange={touch} aria-label="From" /><input class="input" type="date" bind:value={rep.config.range.to} onchange={touch} aria-label="To" />{/if}</div>
          </div>
        {/if}
      </div>

      <div class="field">Columns
        <div class="cols">
          {#each rep.config.cols as k (k)}{@const f = fields.find((x) => x.key === k)}{#if f}<span class="chip on">{f.label}<button onclick={() => move(k, -1)} aria-label="Move left">‹</button><button onclick={() => move(k, 1)} aria-label="Move right">›</button><button onclick={() => toggleCol(k)} aria-label="Remove">×</button></span>{/if}{/each}
          {#each fields.filter((f) => !rep.config.cols.includes(f.key)) as f}<button class="chip" onclick={() => toggleCol(f.key)}>+ {f.label}</button>{/each}
        </div>
      </div>

      <div class="field">Filters
        {#each rep.config.filters as f, i}
          <div class="flt">
            <select class="select" bind:value={f.field} onchange={touch}>{#each fields as x}<option value={x.key}>{x.label}</option>{/each}</select>
            <select class="select" bind:value={f.op} onchange={touch}>{#each Object.entries(OPS) as [k, l]}<option value={k}>{l}</option>{/each}</select>
            {#if !['empty', 'notempty'].includes(f.op)}<input class="input" type={fields.find((x) => x.key === f.field)?.type === 'date' && ['gte', 'lte'].includes(f.op) ? 'date' : 'text'} bind:value={f.value} oninput={touch} placeholder={f.op === 'in' ? 'a, b, c' : 'Value'} />{/if}
            <button class="btn btn-icon btn-ghost btn-sm" onclick={() => { rep.config.filters = rep.config.filters.filter((_, j) => j !== i); touch(); }} aria-label="Remove filter"><Icon name="x" size={14} /></button>
          </div>
        {/each}
        <button class="btn btn-sm add" onclick={addFilter}><Icon name="plus" size={13} />Add filter</button>
      </div>

      <div class="row1">
        <label class="field">Group by<select class="select" bind:value={rep.config.group} onchange={touch}><option value="">No grouping</option>{#each fields as x}<option value={x.key}>{x.label}</option>{/each}</select></label>
        <label class="field">Sort by<select class="select" bind:value={rep.config.sort} onchange={touch}><option value="">Default</option>{#each fields as x}<option value={x.key}>{x.label}</option>{/each}</select></label>
        <label class="field">Order<select class="select" bind:value={rep.config.dir} onchange={touch}><option value={1}>Ascending</option><option value={-1}>Descending</option></select></label>
        <label class="shr"><input type="checkbox" bind:checked={rep.shared} onchange={touch} />Share with team</label>
        <div class="acts">
          {#if rep.id}<button class="btn btn-sm" disabled={busy} onclick={remove}><Icon name="trash" size={13} />Delete</button>{/if}
          <button class="btn btn-sm btn-primary" disabled={busy || (!dirty && rep.id)} onclick={save}><Icon name="save" size={13} />{rep.id ? 'Save' : 'Save report'}</button>
        </div>
      </div>
    </div>

    {#if result.groups}
      <div class="panel panel-pad">
        <div class="panel-head"><span class="panel-title">By {fields.find((f) => f.key === rep.config.group)?.label}</span><span class="panel-sub">{n(result.groups.length)} groups · {n(result.rows.length)} rows</span></div>
        <DataTable id="report-groups" exportName={(rep.name || 'report') + '-summary'} rows={result.groups} columns={groupCols} pageSize={10} dense />
      </div>
    {/if}
    <div class="panel panel-pad">
      <div class="panel-head"><span class="panel-title">{rep.name || 'Preview'}</span><span class="panel-sub">{n(result.rows.length)} rows</span></div>
      {#key rep.dataset + rep.config.cols.join()}
        <DataTable id={'report-' + rep.dataset} exportName={rep.name || rep.dataset} rows={result.rows} {columns} pageSize={15} dense />
      {/key}
    </div>
  </section>
</div>

<style>
  .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 12px; align-items: start; }
  .rlist { display: grid; gap: 4px; position: sticky; top: calc(var(--topbar-h) + 12px); max-height: calc(100vh - var(--topbar-h) - 40px); overflow: auto; }
  .lbl { font-size: 10.5px; font-weight: 700; color: var(--faint); text-transform: uppercase; letter-spacing: .08em; padding: 10px 4px 2px; }
  .it { display: flex; gap: 8px; align-items: flex-start; text-align: left; border: 0; background: none; padding: 7px 8px; border-radius: 9px; cursor: pointer; color: var(--ink-2); }
  .it:hover { background: #f5f6f9; } .it.on { background: var(--brand-50); }
  .it span { display: grid; } .it b { font-size: 12.5px; } .it small { font-size: 11px; color: var(--muted); }
  .sm { font-size: 12px; padding: 4px; }
  .main { display: grid; gap: 12px; min-width: 0; }
  .builder { display: grid; gap: 14px; }
  .row1 { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .row1 .field { min-width: 160px; } .row1 .field:first-child { flex: 1; min-width: 220px; }
  .field { display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); font-weight: 600; }
  .field .input, .field .select { height: 34px; }
  .rg { display: flex; gap: 6px; flex-wrap: wrap; } .rg .input { width: 140px; }
  .cols { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 4px 9px; border-radius: 999px; border: 1px dashed var(--line); background: #fff; font-size: 12px; font-weight: 550; color: var(--muted); cursor: pointer; }
  .chip.on { border-style: solid; border-color: #f8d0b5; background: var(--brand-50); color: var(--brand-600); cursor: default; }
  .chip.on button { border: 0; background: none; color: inherit; cursor: pointer; padding: 0 3px; font-size: 13px; line-height: 1; }
  .flt { display: grid; grid-template-columns: 180px 130px minmax(0, 1fr) auto; gap: 6px; align-items: center; }
  .add { justify-self: start; }
  .shr { display: flex; gap: 6px; align-items: center; font-size: 12.5px; font-weight: 600; height: 34px; } .shr input { accent-color: var(--brand); }
  .acts { margin-left: auto; display: flex; gap: 8px; }
  @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } .rlist { position: static; max-height: none; } .flt { grid-template-columns: 1fr 1fr; } }
</style>
