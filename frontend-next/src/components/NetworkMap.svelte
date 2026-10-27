<script>
  // 2D schematic of the same network (accessible, low-power alternative to the 3D scene).
  let { operators = [], flow = {}, pool = 0, agents = 0, selected = 'all', onpick = () => {} } = $props();
  // operators spread along an arc above the hub (works for any count)
  let POS = $derived(operators.map((_, i, a) => { const t = a.length > 1 ? i / (a.length - 1) : 0.5, ang = Math.PI * (0.92 - t * 0.84); return [50 + Math.cos(ang) * 40, 46 - Math.sin(ang) * 32]; }));
  const hub = [50, 48], poolP = [20, 72], agentP = [80, 72];
  const stages = [['pending', '#f5a524'], ['processing', '#3b82f6'], ['completed', '#22c55e'], ['failed', '#ef4444']];
</script>
<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Network map of operators, hub, pool and agents">
  <defs>
    <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#dfe4ec" stroke-width=".12" /></pattern>
  </defs>
  <rect width="100" height="100" fill="url(#grid)" />
  {#each operators as o, i}
    <line x1={POS[i][0]} y1={POS[i][1]} x2={hub[0]} y2={hub[1]} stroke={o.color} stroke-width={selected === o.key ? 0.9 : 0.5} stroke-dasharray="1.6 1.2" class="flow" opacity={selected === 'all' || selected === o.key ? 1 : 0.3} />
  {/each}
  <line x1={poolP[0]} y1={poolP[1]} x2={hub[0]} y2={hub[1]} stroke="#3b82f6" stroke-width=".5" stroke-dasharray="1.6 1.2" class="flow" />
  <line x1={hub[0]} y1={hub[1]} x2={agentP[0]} y2={agentP[1]} stroke="#22c55e" stroke-width=".5" stroke-dasharray="1.6 1.2" class="flow" />
  <path d="M{poolP[0] + 6},{poolP[1] + 6} Q50,96 {agentP[0] - 6},{agentP[1] + 6}" fill="none" stroke="#3a414e" stroke-width="1.6" stroke-linecap="round" />
  {#each stages as [k, c], i}
    {@const t = 0.16 + i * 0.23}
    {@const x = (1 - t) ** 2 * (poolP[0] + 6) + 2 * (1 - t) * t * 50 + t * t * (agentP[0] - 6)}
    {@const y = (1 - t) ** 2 * (poolP[1] + 6) + 2 * (1 - t) * t * 96 + t * t * (agentP[1] + 6)}
    <g transform="translate({x},{y})"><rect x="-6" y="-7.5" width="12" height="6" rx="1.2" fill={c} /><text y="-5.3" class="gl">{k}</text><text y="-2.6" class="gv">{flow[k] ?? 0}</text></g>
  {/each}
  {#each operators as o, i}
    <g class="node" class:dim={selected !== 'all' && selected !== o.key} transform="translate({POS[i][0]},{POS[i][1]})" onclick={() => onpick(selected === o.key ? 'all' : o.key)} onkeydown={(e) => e.key === 'Enter' && onpick(o.key)} role="button" tabindex="0" aria-label="{o.label} {o.key}">
      <circle r="5" fill="#fff" stroke={o.color} stroke-width={selected === o.key ? 1 : 0.5} />
      <circle r={1.5 + (o.total / 400) * 2.2} fill={o.color} opacity=".18" />
      <text y="-0.4" class="nl sm">{o.key}</text><text y="2.4" class="ns">{o.total} · {o.utilization.toFixed(1)}%</text>
    </g>
  {/each}
  <g transform="translate({hub[0]},{hub[1]})"><circle r="8.5" fill="#fff4ea" stroke="#f26b1d" stroke-width=".8" /><circle r="4" fill="#f26b1d" /><text y="1.1" class="hl">MCube</text><text y="12" class="nl">DID Network</text></g>
  <g transform="translate({poolP[0]},{poolP[1]})"><circle r="6.5" fill="#eef5ff" stroke="#3b82f6" stroke-width=".6" /><text y="-.5" class="nl">DID Pool</text><text y="2.8" class="ns">{pool} available</text></g>
  <g transform="translate({agentP[0]},{agentP[1]})"><circle r="6.5" fill="#effbf3" stroke="#22c55e" stroke-width=".6" /><text y="-.5" class="nl">Agents</text><text y="2.8" class="ns">{agents.toLocaleString('en-IN')}</text></g>
</svg>
<style>
  svg { width: 100%; height: 100%; display: block; font-family: inherit; }
  text { text-anchor: middle; }
  .nl { font-size: 2.2px; font-weight: 700; fill: #141a26; } .nl.sm { font-size: 1.45px; } .ns { font-size: 1.7px; fill: #6b7486; } .nu { font-size: 1.8px; font-weight: 700; fill: #d4570d; }
  .hl { font-size: 2px; font-weight: 800; fill: #fff; }
  .gl { font-size: 1.5px; fill: #fff; font-weight: 600; text-transform: capitalize; } .gv { font-size: 2.2px; fill: #fff; font-weight: 800; }
  .node { cursor: pointer; transition: opacity .2s; } .node.dim { opacity: .35; } .node:focus-visible circle:first-child { stroke-width: 1.2; }
  .flow { animation: dash 1.6s linear infinite; } @keyframes dash { to { stroke-dashoffset: -5.6; } }
  @media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
</style>
