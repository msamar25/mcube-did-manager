<script>
  let { title, sub = '', eyebrow = '', actions } = $props();
</script>
<div class="ph">
  <div class="t">{#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}<h1 class="page-title">{title}</h1>{#if sub}<p class="page-sub">{sub}</p>{/if}</div>
  {#if actions}<div class="a">{@render actions()}</div>{/if}
</div>
<style>
  .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .t { display: grid; gap: 1px; min-width: 0; }
  .a { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
