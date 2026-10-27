<script>
  // Sortable, searchable, paginated table. Custom cells via the `cell` snippet.
  // Toolbar: search with a "Search in" field picker, and a Columns menu (choice remembered per table `id`).
  // Column options: value(r) for sort/search, search(r) extra searchable text, lock: true = cannot be hidden,
  // export(r) value written to CSV (defaults to value(r) / the raw field). Export = current filter + sort.
  import { downloadCsv } from '../lib/format.js';
  let { exportName = '', rows = [], columns = [], cell, pageSize = 10, onrow, rowKey = (r, i) => i, selectable = false, selected = $bindable([]), canSelect = () => true, empty = 'No records match the current filters.', dense = false, height, id = '', toolbar = true, placeholder = 'Search', tools } = $props();
  let sortKey = $state(null), sortDir = $state(1), page = $state(1), q = $state(''), field = $state('all'), colMenu = $state(false), expMenu = $state(false);
  const storeKey = () => (id ? 'next_cols:' + id : '');
  let hidden = $state((() => { try { return id ? JSON.parse(localStorage.getItem('next_cols:' + id) || '[]') : []; } catch { return []; } })());
  function toggleCol(k) { hidden = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; try { if (storeKey()) localStorage.setItem(storeKey(), JSON.stringify(hidden)); } catch { /* private mode */ } }
  let shown = $derived(columns.filter((c) => c.lock || !hidden.includes(c.key)));
  const text = (c, r) => { const v = c.search ? c.search(r) : c.value ? c.value(r) : r[c.key]; return v === null || v === undefined ? '' : String(v); };
  let searchable = $derived(columns.filter((c) => c.searchable !== false));
  let filtered = $derived.by(() => {
    const t = q.trim().toLowerCase(); if (!t) return rows;
    const cols = field === 'all' ? searchable : searchable.filter((c) => c.key === field);
    return rows.filter((r) => cols.some((c) => text(c, r).toLowerCase().includes(t)));
  });
  $effect(() => { q; field; page = 1; });
  let sorted = $derived.by(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    const get = col?.value || ((r) => r[sortKey]);
    return [...filtered].sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  });
  let pages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  $effect(() => { if (page > pages) page = pages; });
  let visible = $derived(sorted.slice((page - 1) * pageSize, page * pageSize));
  function sort(c) { if (c.sort === false) return; if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = c.num ? -1 : 1; } }
  const sel = (r, i) => selected.includes(rowKey(r, i));
  function toggle(r, i) { const k = rowKey(r, i); selected = selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]; }
  let pageKeys = $derived(visible.map((r, i) => r).filter((r) => canSelect(r)).map((r) => rowKey(r)));
  let allOn = $derived(pageKeys.length > 0 && pageKeys.every((k) => selected.includes(k)));
  const expVal = (c, r) => { const v = c.export ? c.export(r) : c.value ? c.value(r) : r[c.key]; return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v; };
  function exportRows(all) {
    const cols = (all ? columns : shown).filter((c) => c.label);
    downloadCsv(sorted.map((r) => Object.fromEntries(cols.map((c) => [c.label, expVal(c, r)]))), `${exportName || id || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`);
    expMenu = false;
  }
  function toggleAll() { selected = allOn ? selected.filter((k) => !pageKeys.includes(k)) : [...new Set([...selected, ...pageKeys])]; }
</script>

<div class="dt">
  {#if toolbar}
    <div class="tb">
      <div class="search srch"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input class="input" bind:value={q} placeholder={field === 'all' ? placeholder : `Search ${columns.find((c) => c.key === field)?.label || ''}`} aria-label="Search table" />
        {#if q}<button class="clr" onclick={() => (q = '')} aria-label="Clear search">×</button>{/if}</div>
      <select class="select fsel" bind:value={field} aria-label="Search in"><option value="all">In all columns</option>{#each searchable as c}<option value={c.key}>In {c.label}</option>{/each}</select>
      {@render tools?.()}
      <div class="spacer"></div>
      {#if q}<span class="muted cnt">{filtered.length.toLocaleString('en-IN')} match{filtered.length === 1 ? '' : 'es'}</span>{/if}
      <div class="cm">
        <button class="btn btn-sm" disabled={!sorted.length} onclick={() => { expMenu = !expMenu; colMenu = false; }} aria-expanded={expMenu}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Export</button>
        {#if expMenu}
          <div class="cmenu glass" role="menu">
            <button class="mi" onclick={() => exportRows(false)}>Shown columns · {sorted.length.toLocaleString('en-IN')} rows</button>
            <button class="mi" onclick={() => exportRows(true)}>All columns · {sorted.length.toLocaleString('en-IN')} rows</button>
          </div>
        {/if}
      </div>
      <div class="cm">
        <button class="btn btn-sm" onclick={() => { colMenu = !colMenu; expMenu = false; }} aria-expanded={colMenu}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16" /></svg>Columns{#if hidden.length}<span class="hc">{columns.length - shown.length} hidden</span>{/if}</button>
        {#if colMenu}
          <div class="cmenu glass" role="menu">
            {#each columns as c}<label class:dis={c.lock}><input type="checkbox" checked={c.lock || !hidden.includes(c.key)} disabled={c.lock} onchange={() => toggleCol(c.key)} />{c.label}</label>{/each}
            {#if hidden.length}<button class="lnk" onclick={() => { hidden = []; try { if (storeKey()) localStorage.removeItem(storeKey()); } catch { /* private mode */ } }}>Show all</button>{/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <div class="table-wrap" style={height ? `max-height:${height}` : ''}>
    <table class="tbl" class:dense>
      <thead><tr>
        {#if selectable}<th style="width:30px"><input type="checkbox" checked={allOn} onchange={toggleAll} aria-label="Select page" /></th>{/if}
        {#each shown as c}
          <th class:sortable={c.sort !== false} class:num={c.num} style={(c.width ? `width:${c.width};` : '') + (c.minWidth ? `min-width:${c.minWidth}` : '')} onclick={() => sort(c)} aria-sort={sortKey === c.key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}>
            {c.label}{#if sortKey === c.key}<span class="arr">{sortDir > 0 ? '↑' : '↓'}</span>{/if}
          </th>
        {/each}
      </tr></thead>
      <tbody>
        {#each visible as r, i (rowKey(r, i) + '-' + i)}
          <tr class:sel={selectable && sel(r)} class:click={!!onrow} onclick={() => onrow?.(r)}>
            {#if selectable}<td onclick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel(r)} disabled={!canSelect(r)} onchange={() => toggle(r)} aria-label="Select row" /></td>{/if}
            {#each shown as c}
              <td class:num={c.num} class:mono={c.mono} class:strong={c.strong} style={c.minWidth ? `min-width:${c.minWidth}` : ''}>
                {#if cell && c.custom}{@render cell(r, c)}{:else}{c.format ? c.format(r[c.key], r) : (r[c.key] ?? '—')}{/if}
              </td>
            {/each}
          </tr>
        {:else}
          <tr><td colspan={shown.length + (selectable ? 1 : 0)}><div class="empty">{empty}</div></td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if sorted.length > pageSize}
    <div class="pager">
      <span class="muted tnum">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length.toLocaleString('en-IN')}</span>
      <div class="row">
        <button class="btn btn-sm" disabled={page <= 1} onclick={() => page--}>Prev</button>
        <span class="tnum pg">{page} / {pages}</span>
        <button class="btn btn-sm" disabled={page >= pages} onclick={() => page++}>Next</button>
      </div>
    </div>
  {/if}
</div>
<style>
  .tb { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .srch { position: relative; width: 260px; max-width: 100%; } .srch .input { padding-right: 26px; }
  .clr { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: none; font-size: 16px; color: var(--muted); cursor: pointer; line-height: 1; }
  .fsel { width: auto; max-width: 190px; }
  .cnt { font-size: 12px; }
  .cm { position: relative; } .cm .btn { gap: 6px; }
  .hc { font-size: 10.5px; color: var(--brand-600); font-weight: 650; }
  .cmenu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 200px; max-height: 320px; overflow: auto; padding: 8px; border-radius: 12px; border: 1px solid var(--line); background: #fff; box-shadow: var(--shadow); display: grid; gap: 2px; }
  .cmenu label { display: flex; gap: 8px; align-items: center; font-size: 12.5px; padding: 5px 6px; border-radius: 7px; cursor: pointer; } .cmenu label:hover { background: #f5f6f9; } .cmenu label.dis { opacity: .55; cursor: default; }
  .cmenu .mi { border: 0; background: none; text-align: left; padding: 7px 8px; border-radius: 7px; font-size: 12.5px; white-space: nowrap; cursor: pointer; } .cmenu .mi:hover { background: #f5f6f9; }
  .cmenu .lnk { border: 0; background: none; color: var(--brand-600); font-weight: 650; font-size: 12px; text-align: left; padding: 6px; cursor: pointer; }
  @media (max-width: 560px) { .srch { width: 100%; } .fsel { flex: 1; max-width: none; } }
  .dt { display: grid; gap: 8px; min-width: 0; }
  .arr { margin-left: 4px; color: var(--brand); }
  tr.click { cursor: pointer; }
  .dense :global(td) { padding-top: 6px; padding-bottom: 6px; }
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; padding: 0 2px; }
  .pg { min-width: 54px; text-align: center; color: var(--ink-2); font-weight: 600; }
  input[type=checkbox] { accent-color: var(--brand); width: 14px; height: 14px; }
</style>
