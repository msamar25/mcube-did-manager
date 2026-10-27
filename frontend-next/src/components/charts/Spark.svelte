<script>
  let { values = [], color = 'var(--brand)', width = 90, height = 28, fill = true } = $props();
  let pts = $derived.by(() => { const max = Math.max(...values), min = Math.min(...values); return values.map((v, i) => [(i / Math.max(1, values.length - 1)) * width, height - 2 - ((v - min) / (max - min || 1)) * (height - 4)]); });
  let d = $derived(pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
</script>
<svg {width} {height} aria-hidden="true" style="display:block;overflow:visible">
  {#if fill && pts.length}<path d="{d} L{width},{height} L0,{height} Z" fill={color} opacity=".12" />{/if}
  <path {d} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
