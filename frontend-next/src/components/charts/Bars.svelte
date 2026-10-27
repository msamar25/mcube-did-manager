<script>
  // Vertical bar chart for whole-number counts (e.g. replacements per hour). Integer axis, hover tooltip.
  let { values = [], labels = [], height = 150, color = '#f26b1d', label = 'Bar chart', unit = '' } = $props();
  let w = $state(0), hover = $state(-1);
  const pad = { t: 10, b: 22, l: 28, r: 6 };
  let n = $derived(values.length);
  let top = $derived(Math.max(1, ...values));
  let step = $derived(top <= 4 ? 1 : Math.ceil(top / 4));
  let hi = $derived(Math.ceil(top / step) * step);
  let ticks = $derived(Array.from({ length: hi / step + 1 }, (_, i) => i * step));
  let bw = $derived(Math.max(2, (w - pad.l - pad.r) / Math.max(1, n)));
  let every = $derived(Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 56)))));
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / hi);
</script>
<div class="chart" bind:clientWidth={w}>
  <svg width={w} {height} role="img" aria-label={label} onmouseleave={() => (hover = -1)}>
    {#each ticks as t}<line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line-2)" /><text x={pad.l - 6} y={y(t) + 3.5} text-anchor="end" class="ax">{t}</text>{/each}
    {#each values as v, i}
      <rect role="presentation" x={pad.l + i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(0, y(0) - y(v))} rx="2" fill={color} opacity={hover === -1 || hover === i ? 1 : 0.45} onmouseenter={() => (hover = i)} />
      {#if i % every === 0}<text x={pad.l + i * bw + bw / 2} y={height - 5} text-anchor="middle" class="ax">{labels[i]}</text>{/if}
    {/each}
  </svg>
  {#if hover >= 0}<div class="tip" style="left:{Math.min(Math.max(pad.l + hover * bw + bw / 2, 60), w - 60)}px"><b>{labels[hover]}</b><span>{values[hover]}{unit}</span></div>{/if}
</div>
<style>
  .chart { position: relative; width: 100%; }
  svg { display: block; overflow: visible; }
  .ax { font-size: 10px; fill: var(--faint); font-variant-numeric: tabular-nums; }
  .tip { position: absolute; top: 0; transform: translateX(-50%); background: #141a26; color: #fff; font-size: 11px; padding: 5px 8px; border-radius: 7px; pointer-events: none; display: grid; gap: 1px; white-space: nowrap; }
</style>
