<script>
  import { statusLabel } from '../lib/format.js';
  let { status = '', label } = $props();
  const key = $derived(String(status).toLowerCase());
</script>
<span class="badge {key}"><span class="dot"></span>{label || statusLabel(key)}</span>
