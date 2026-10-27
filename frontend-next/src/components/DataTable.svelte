<script>
  // Compact sortable, paginated table. Custom cells via the `cell` snippet.
  let { rows = [], columns = [], cell, pageSize = 10, onrow, rowKey = (r, i) => i, selectable = false, selected = $bindable([]), canSelect = () => true, empty = 'No records match the current filters.', dense = false, height } = $props();
  let sortKey = $state(null), sortDir = $state(1), page = $state(1);
  let sorted = $derived.by(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const get = col?.value || ((r) => r[sortKey]);
    return [...rows].sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  });
  let pages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  $effect(() => { if (page > pages) page = pages; });
  let visible = $derived(sorted.slice((page - 1) * pageSize, page * pageSize));
  function sort(c) { if (c.sort === false) return; if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = c.num ? -1 : 1; } }
  const sel = (r, i) => selected.includes(rowKey(r, i));
  function toggle(r, i) { const k = rowKey(r, i); selected = selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]; }
  let pageKeys = $derived(visible.map((r, i) => r).filter((r) => canSelect(r)).map((r) => rowKey(r)));
  let allOn = $derived(pageKeys.length > 0 && pageKeys.every((k) => selected.includes(k)));
  function toggleAll() { selected = allOn ? selected.filter((k) => !pageKeys.includes(k)) : [...new Set([...selected, ...pageKeys])]; }
</script>

<div class="dt">
  <div class="table-wrap" style={height ? `max-height:${height}` : ''}>
    <table class="tbl" class:dense>
      <thead><tr>
        {#if selectable}<th style="width:30px"><input type="checkbox" checked={allOn} onchange={toggleAll} aria-label="Select page" /></th>{/if}
        {#each columns as c}
          <th class:sortable={c.sort !== false} class:num={c.num} style={c.width ? `width:${c.width}` : ''} onclick={() => sort(c)} aria-sort={sortKey === c.key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}>
            {c.label}{#if sortKey === c.key}<span class="arr">{sortDir > 0 ? '↑' : '↓'}</span>{/if}
          </th>
        {/each}
      </tr></thead>
      <tbody>
        {#each visible as r, i (rowKey(r, i) + '-' + i)}
          <tr class:sel={selectable && sel(r)} class:click={!!onrow} onclick={() => onrow?.(r)}>
            {#if selectable}<td onclick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel(r)} disabled={!canSelect(r)} onchange={() => toggle(r)} aria-label="Select row" /></td>{/if}
            {#each columns as c}
              <td class:num={c.num} class:mono={c.mono} class:strong={c.strong}>
                {#if cell && c.custom}{@render cell(r, c)}{:else}{c.format ? c.format(r[c.key], r) : (r[c.key] ?? '—')}{/if}
              </td>
            {/each}
          </tr>
        {:else}
          <tr><td colspan={columns.length + (selectable ? 1 : 0)}><div class="empty">{empty}</div></td></tr>
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
  .dt { display: grid; gap: 8px; min-width: 0; }
  .arr { margin-left: 4px; color: var(--brand); }
  tr.click { cursor: pointer; }
  .dense :global(td) { padding-top: 6px; padding-bottom: 6px; }
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; padding: 0 2px; }
  .pg { min-width: 54px; text-align: center; color: var(--ink-2); font-weight: 600; }
  input[type=checkbox] { accent-color: var(--brand); width: 14px; height: 14px; }
</style>
