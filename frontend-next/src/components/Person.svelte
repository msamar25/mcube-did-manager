<script>
  import { initials, avatarColor } from '../lib/format.js';
  let { name = '', sub = '', size = 26, onclick } = $props();
</script>
{#if onclick}
  <button class="person link" {onclick} type="button">
    <span class="avatar" style="width:{size}px;height:{size}px;background:{avatarColor(name)}">{initials(name)}</span>
    <span class="txt"><span class="nm">{name || 'Unknown'}</span>{#if sub}<small>{sub}</small>{/if}</span>
  </button>
{:else}
  <span class="person">
    <span class="avatar" style="width:{size}px;height:{size}px;background:{avatarColor(name)}">{initials(name)}</span>
    <span class="txt"><span class="nm">{name || 'Unknown'}</span>{#if sub}<small>{sub}</small>{/if}</span>
  </span>
{/if}
<style>
  .link { border: 0; background: none; padding: 0; text-align: left; cursor: pointer; }
  .link:hover .nm { color: var(--brand-600); text-decoration: underline; text-underline-offset: 2px; }
  .txt { display: grid; min-width: 0; line-height: 1.2; }
  .nm { font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
