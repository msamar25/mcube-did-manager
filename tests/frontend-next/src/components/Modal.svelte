<script>
  import Icon from './Icon.svelte';
  import { portal } from '../lib/portal.js';
  let { open = false, title = '', onclose = () => {}, children, footer, width = 460 } = $props();
  function key(e) { if (e.key === 'Escape' && open) onclose(); }
</script>
<svelte:window onkeydown={key} />
{#if open}
  <div class="wrap" use:portal role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="modal" style="--w:{width}px" role="dialog" aria-modal="true" aria-label={title}>
      <header><h3>{title}</h3><button class="btn btn-icon btn-ghost" onclick={onclose} aria-label="Close"><Icon name="x" /></button></header>
      <div class="body">{@render children?.()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
  </div>
{/if}
<style>
  .wrap { position: fixed; inset: 0; z-index: 90; background: rgba(20,26,38,.32); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: f .2s; }
  .modal { width: min(var(--w), 100%); background: #fff; border-radius: var(--r-xl); box-shadow: var(--shadow-lg); animation: p .25s cubic-bezier(.2,.8,.2,1); max-height: calc(100vh - 32px); display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  h3 { font-size: 15px; }
  .body { padding: 14px 16px; display: grid; gap: 12px; overflow: auto; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: #fafbfc; border-radius: 0 0 var(--r-xl) var(--r-xl); }
  @keyframes f { from { opacity: 0 } } @keyframes p { from { transform: scale(.97); opacity: 0 } }
</style>
