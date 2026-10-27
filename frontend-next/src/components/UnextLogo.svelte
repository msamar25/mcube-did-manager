<script>
  // Official UNext wordmark (src/assets/unext-logo.svg). "next" follows the text colour.
  import svg from '../assets/unext-logo.svg?raw';
  let { height = 30, dark = false } = $props();
</script>
<span class="ulogo" style="height:{height}px;width:{(height * 321) / 85}px;color:{dark ? '#ffffff' : '#0b0b0b'}" role="img" aria-label="UNext">{@html svg}</span>
<style>
  .ulogo { display: inline-block; flex: none; line-height: 0; }
  .ulogo :global(svg) { width: 100%; height: 100%; display: block; }
</style>
