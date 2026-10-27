<script>
  // Vertical bars, one colour per entity, direct value labels, hover tooltip.
  let { data = [], height = 150, format = (v) => v.toLocaleString('en-IN'), label = 'Bar chart', unit = '' } = $props();
  let w = $state(0), hover = $state(-1);
  const pad = { t: 20, b: 22, l: 4, r: 4 };
  let max = $derived(Math.max(1, ...data.map((d) => d.value)) * 1.08);
  let bw = $derived(Math.min(46, ((w - pad.l - pad.r) / Math.max(1, data.length)) * 0.56));
  const x = (i) => pad.l + ((w - pad.l - pad.r) / data.length) * (i + 0.5);
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
</script>
<div class="chart" bind:clientWidth={w}>
  <svg width={w} {height} role="img" aria-label={label}>
    <line x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="var(--line)" />
    {#each data as d, i}
      {@const bx = x(i) - bw / 2}
      {@const by = y(d.value)}
      {@const bh = height - pad.b - by}
      <g onmouseenter={() => (hover = i)} onmouseleave={() => (hover = -1)} role="presentation">
        <rect x={x(i) - bw / 2 - 6} y={pad.t} width={bw + 12} height={height - pad.t - pad.b} fill="transparent" />
        <path d="M{bx},{by + bh} V{by + 4} Q{bx},{by} {bx + 4},{by} H{bx + bw - 4} Q{bx + bw},{by} {bx + bw},{by + 4} V{by + bh} Z" fill={d.color} opacity={hover === -1 || hover === i ? 1 : 0.45} style="transition:opacity .15s" />
        <text x={x(i)} y={by - 6} text-anchor="middle" class="v">{format(d.value)}</text>
        <text x={x(i)} y={height - 6} text-anchor="middle" class="l">{d.label}</text>
      </g>
    {/each}
  </svg>
  {#if hover >= 0}
    <div class="tip" style="left:{x(hover)}px;top:{y(data[hover].value) - 8}px"><b>{data[hover].label}</b><span>{format(data[hover].value)}{unit}</span>{#if data[hover].note}<small>{data[hover].note}</small>{/if}</div>
  {/if}
</div>
<style>
  .chart { position: relative; width: 100%; min-width: 0; overflow: visible; }
  svg { display: block; overflow: visible; }
  .v { font-size: 11px; font-weight: 650; fill: var(--ink); font-variant-numeric: tabular-nums; }
  .l { font-size: 11px; fill: var(--muted); }
  .tip { position: absolute; transform: translate(-50%, -100%); background: #141a26; color: #fff; border-radius: 8px; padding: 6px 9px; font-size: 11.5px; pointer-events: none; display: grid; white-space: nowrap; z-index: 2; }
  .tip small { opacity: .7; }
</style>
