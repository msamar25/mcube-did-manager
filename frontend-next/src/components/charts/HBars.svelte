<script>
  // Compact horizontal bars: readable with many long category names (e.g. 9 MCube operators).
  import { logoSvg } from '../../three/logos.js';
  let { data = [], max, format = (v) => v.toLocaleString('en-IN'), logos = false, onpick } = $props();
  let top = $derived(max ?? Math.max(1, ...data.map((d) => d.value)));
</script>
<div class="hb" role="list">
  {#each data as d}
    <svelte:element this={onpick ? 'button' : 'div'} class="r" role="listitem" onclick={() => onpick?.(d)} title="{d.label}: {format(d.value)}{d.note ? ' · ' + d.note : ''}">
      <span class="n">{#if logos}{@html logoSvg(d.label, 16)}{/if}<span class="t">{d.label}</span></span>
      <span class="b"><i style="width:{(d.value / top) * 100}%;background:{d.color}"></i></span>
      <b class="tnum">{format(d.value)}</b>
    </svelte:element>
  {/each}
</div>
<style>
  .hb { display: grid; gap: 5px; }
  .r { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) 34px; gap: 8px; align-items: center; font-size: 11.5px; border: 0; background: none; padding: 2px 0; text-align: left; color: inherit; font: inherit; font-size: 11.5px; }
  button.r { cursor: pointer; border-radius: 6px; } button.r:hover { background: #f6f7f9; }
  .n { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--ink-2); }
  .n :global(.cc-brand) { display: inline-grid; border-radius: 50%; overflow: hidden; flex: none; } .n :global(.cc-brand svg) { width: 100%; height: 100%; }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .b { height: 7px; background: var(--line-2); border-radius: 4px; overflow: hidden; } .b i { display: block; height: 100%; border-radius: 4px; }
  b { text-align: right; color: var(--ink); }
</style>
