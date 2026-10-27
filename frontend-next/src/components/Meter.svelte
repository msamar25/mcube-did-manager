<script>
  let { value = 0, max = 100, color = 'var(--brand)', height = 6 } = $props();
</script>
<div class="m" style="height:{height}px" role="meter" aria-valuenow={value} aria-valuemin="0" aria-valuemax={max}><span style="width:{Math.min(100, (value / (max || 1)) * 100)}%;background:{color}"></span></div>
<style>.m { background: var(--line-2); border-radius: 99px; overflow: hidden; width: 100%; } span { display: block; height: 100%; border-radius: 99px; transition: width .5s cubic-bezier(.2,.8,.2,1); }</style>
