<script>
  // Multi-series line/area chart with crosshair tooltip. Single y-axis only.
  let { series = [], labels = [], height = 160, area = false, yMax, yMin = 0, ySuffix = '', label = 'Line chart', ticks = 3 } = $props();
  let w = $state(0), hover = $state(-1);
  const pad = { t: 10, b: 22, l: 34, r: 10 };
  let n = $derived(labels.length);
  let hi = $derived(yMax ?? Math.max(1, ...series.flatMap((s) => s.values)) * 1.15);
  const x = (i) => pad.l + ((w - pad.l - pad.r) * i) / Math.max(1, n - 1);
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - (v - yMin) / (hi - yMin));
  function path(vals) {
    if (!vals.length) return '';
    let d = `M${x(0)},${y(vals[0])}`;
    for (let i = 1; i < vals.length; i++) { const cx = (x(i - 1) + x(i)) / 2; d += ` C${cx},${y(vals[i - 1])} ${cx},${y(vals[i])} ${x(i)},${y(vals[i])}`; }
    return d;
  }
  let grid = $derived(Array.from({ length: ticks + 1 }, (_, i) => yMin + ((hi - yMin) * i) / ticks));
  let step = $derived(Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64)))));
  function move(e) { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; hover = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (n - 1)))); }
</script>
<div class="chart" bind:clientWidth={w}>
  <svg width={w} {height} role="img" aria-label={label} onmousemove={move} onmouseleave={() => (hover = -1)}>
    <defs>{#each series as s, si}<linearGradient id="ga{si}{label.length}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={s.color} stop-opacity=".22" /><stop offset="1" stop-color={s.color} stop-opacity="0" /></linearGradient>{/each}</defs>
    {#each grid as g}
      <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--line-2)" />
      <text x={pad.l - 6} y={y(g) + 3.5} text-anchor="end" class="ax">{Math.round(g)}{ySuffix}</text>
    {/each}
    {#each labels as l, i}{#if i % step === 0 || i === n - 1}<text x={x(i)} y={height - 5} text-anchor="middle" class="ax">{l}</text>{/if}{/each}
    {#each series as s, si}
      {#if area}<path d="{path(s.values)} L{x(n - 1)},{y(yMin)} L{x(0)},{y(yMin)} Z" fill="url(#ga{si}{label.length})" />{/if}
      <path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linecap="round" />
    {/each}
    {#if hover >= 0}
      <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="#9aa3b2" stroke-dasharray="3 3" />
      {#each series as s}<circle cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="#fff" stroke-width="2" />{/each}
    {/if}
  </svg>
  {#if hover >= 0}
    <div class="tip" style="left:{Math.min(Math.max(x(hover), 70), w - 70)}px"><b>{labels[hover]}</b>{#each series as s}<span><i style="background:{s.color}"></i>{s.name}<em>{s.values[hover]}{ySuffix}</em></span>{/each}</div>
  {/if}
</div>
<style>
  .chart { position: relative; width: 100%; min-width: 0; overflow: visible; }
  svg { display: block; overflow: visible; }
  .ax { font-size: 10.5px; fill: var(--faint); font-variant-numeric: tabular-nums; }
  .tip { position: absolute; top: 0; transform: translateX(-50%); background: #141a26; color: #fff; border-radius: 8px; padding: 7px 10px; font-size: 11.5px; pointer-events: none; display: grid; gap: 2px; min-width: 120px; z-index: 2; }
  .tip span { display: flex; align-items: center; gap: 6px; }
  .tip i { width: 7px; height: 7px; border-radius: 50%; }
  .tip em { margin-left: auto; font-style: normal; font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
