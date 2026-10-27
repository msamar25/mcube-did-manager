<script module>
  export const toasts = $state([]);
  export function toast(msg, tone = 'ok') { const id = Math.random(); toasts.push({ id, msg, tone }); setTimeout(() => { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) toasts.splice(i, 1); }, 3600); }
</script>
<script>import Icon from './Icon.svelte';</script>
<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}<div class="t {t.tone}"><Icon name={t.tone === 'ok' ? 'ok' : 'alert'} size={15} />{t.msg}</div>{/each}
</div>
<style>
  .toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 8px; z-index: 100; width: max-content; max-width: calc(100vw - 32px); }
  .t { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-radius: 12px; background: #141a26; color: #fff; font-weight: 550; box-shadow: var(--shadow-lg); animation: u .3s cubic-bezier(.2,.8,.2,1); }
  .t.ok :global(svg) { color: #4ade80; } .t.warn :global(svg) { color: #fbbf24; }
  @keyframes u { from { transform: translateY(10px); opacity: 0 } }
</style>
