<script>
  import Icon from './Icon.svelte';
  let { label, value, sub = '', icon = 'activity', tone = 'neutral', trend = null, onclick } = $props();
</script>
<svelte:element this={onclick ? 'button' : 'div'} class="kpi panel" class:click={!!onclick} {onclick} role={onclick ? 'button' : undefined}>
  <span class="ic {tone}"><Icon name={icon} size={16} /></span>
  <span class="body">
    <span class="lbl">{label}</span>
    <span class="val tnum">{value}</span>
    {#if sub || trend !== null}<span class="sub">{#if trend !== null}<b class:up={trend >= 0} class:dn={trend < 0}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%</b>{/if}{sub}</span>{/if}
  </span>
</svelte:element>
<style>
  .kpi { display: flex; gap: 11px; align-items: flex-start; padding: 12px 14px; text-align: left; width: 100%; min-width: 0; font: inherit; color: inherit; }
  .kpi.click { cursor: pointer; transition: box-shadow .15s, transform .15s; }
  .kpi.click:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
  .ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--line-2); color: var(--ink-2); }
  .ic.brand { background: var(--brand-50); color: var(--brand-600); }
  .ic.ok { background: var(--ok-50); color: var(--ok); }
  .ic.info { background: var(--info-50); color: var(--info); }
  .ic.warn { background: var(--warn-50); color: var(--warn); }
  .ic.bad { background: var(--bad-50); color: var(--bad); }
  .body { display: grid; gap: 1px; min-width: 0; }
  .lbl { font-size: 11.5px; color: var(--muted); font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { font-size: 20px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 11px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 0 6px; overflow-wrap: anywhere; min-width: 0; }
  .sub b { font-weight: 650; }
  .up { color: var(--ok); } .dn { color: var(--bad); }
</style>
