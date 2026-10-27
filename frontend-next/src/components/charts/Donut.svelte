<script>
  let { segments = [], size = 120, thickness = 16, center = '', sub = '', label = 'Donut chart' } = $props();
  let hover = $state(-1);
  let total = $derived(segments.reduce((s, x) => s + x.value, 0) || 1);
  const r = $derived((size - thickness) / 2), c = $derived(2 * Math.PI * r);
  let arcs = $derived.by(() => { let acc = 0; return segments.map((s) => { const len = (s.value / total) * c; const a = { ...s, len, off: acc }; acc += len; return a; }); });
</script>
<div class="donut" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label={label}>
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--line-2)" stroke-width={thickness} />
    {#each arcs as a, i}
      {#if a.value > 0}
        <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={a.color} stroke-width={hover === i ? thickness + 3 : thickness}
          stroke-dasharray="{Math.max(0, a.len - 2)} {c}" stroke-dashoffset={-a.off} transform="rotate(-90 {size / 2} {size / 2})"
          onmouseenter={() => (hover = i)} onmouseleave={() => (hover = -1)} role="presentation" style="transition:stroke-width .15s" />
      {/if}
    {/each}
  </svg>
  <div class="c">{#if hover >= 0}<b class="tnum">{segments[hover].value.toLocaleString('en-IN')}</b><small>{segments[hover].label}</small>{:else}<b>{center}</b><small>{sub}</small>{/if}</div>
</div>
<style>
  .donut { position: relative; flex: none; }
  svg { display: block; }
  .c { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; line-height: 1.15; }
  b { font-size: 19px; font-weight: 750; letter-spacing: -.02em; }
  small { font-size: 10.5px; color: var(--muted); }
</style>
