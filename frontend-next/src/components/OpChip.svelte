<script>
  import { logoSvg } from '../three/logos.js';
  let { name } = $props();
</script>
<span class="op-chip" title={name}>{@html logoSvg(name, 18)}<span class="nm">{name || '—'}</span></span>
<style>
  .op-chip { min-width: 0; max-width: 100%; } .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .op-chip :global(.cc-brand) { display: inline-grid; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 1px rgba(20,26,38,.08); }
  .op-chip :global(.cc-brand svg) { width: 100%; height: 100%; display: block; }
  .op-chip :global(.cc-logo) { display: inline-grid; place-items: center; border-radius: 50%; background: #94a3b8; color: #fff; font-size: 10px; font-weight: 800; }
</style>
