<script>
  import Icon from './Icon.svelte';
  import { portal } from '../lib/portal.js';
  let { open = false, title = '', sub = '', width = 520, onclose = () => {}, children, actions } = $props();
  function key(e) { if (e.key === 'Escape' && open) onclose(); }
</script>
<svelte:window onkeydown={key} />
{#if open}
  <div class="dwrap" use:portal>
  <div class="scrim" onclick={onclose} role="presentation"></div>
  <aside class="drawer" style="--w:{width}px" role="dialog" aria-modal="true" aria-label={title}>
    <header><div><h3>{title}</h3>{#if sub}<p class="muted">{sub}</p>{/if}</div><div class="row">{@render actions?.()}<button class="btn btn-icon btn-ghost" onclick={onclose} aria-label="Close"><Icon name="x" /></button></div></header>
    <div class="content scroll-y">{@render children?.()}</div>
  </aside>
  </div>
{/if}
<style>
  .scrim { position: fixed; inset: 0; background: rgba(20,26,38,.28); backdrop-filter: blur(2px); z-index: 80; animation: f .2s; }
  .drawer { position: fixed; top: 10px; right: 10px; bottom: 10px; width: min(var(--w), calc(100vw - 20px)); z-index: 81; background: var(--glass-strong); backdrop-filter: var(--blur); border: 1px solid var(--glass-border); border-radius: var(--r-xl); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; animation: s .28s cubic-bezier(.2,.8,.2,1); }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 16px 12px; border-bottom: 1px solid var(--line); }
  h3 { font-size: 16px; } p { font-size: 12px; margin-top: 2px; }
  .content { padding: 14px 16px 18px; flex: 1; display: grid; gap: 12px; align-content: start; }
  @keyframes f { from { opacity: 0 } } @keyframes s { from { transform: translateX(30px); opacity: 0 } }
</style>
