<script>
  // Lazy-loads the Three.js Command Center so other screens never download it.
  import { onMount } from 'svelte';
  let { data, theme = 'default', interactive = true, labels = true, selected = null, view = '3d', autoRotate = false, paused = false, quality, reserve = '', onselect = () => {}, label = 'Interactive 3D DID network' } = $props();
  let host, scene = $state(null), status = $state('loading'), err = $state('');

  function webglOk() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  onMount(() => {
    let dead = false;
    if (!webglOk()) { status = 'nowebgl'; return; }
    import('../three/CommandScene.js').then(({ CommandScene }) => {
      if (dead) return;
      try {
        const q = new URLSearchParams(location.search).get('q') || quality;
        scene = new CommandScene(host, { data, theme, interactive, labels, reserve, quality: q, onSelect: (s) => onselect(s) });
        status = 'ready';
        if (typeof window !== 'undefined') window.__ccScene = scene;
      } catch (e) { status = 'error'; err = e?.message || String(e); }
    }).catch((e) => { status = 'error'; err = e?.message || String(e); });
    return () => { dead = true; scene?.dispose(); scene = null; };
  });

  $effect(() => { if (scene && data) scene.setData(data); });
  $effect(() => { if (scene) scene.select(selected); });
  $effect(() => { if (scene) scene.setView(view); });
  $effect(() => { if (scene) scene.setAutoRotate(autoRotate); });
  $effect(() => { if (scene) scene.paused = paused; });

  export function reset() { scene?.resetView(); }
</script>

<div class="scene" class:clay={theme === 'clay'} bind:this={host} role="img" aria-label={label}>
  {#if status === 'loading'}
    <div class="state"><div class="spinner"></div><span>Building 3D network…</span></div>
  {:else if status === 'nowebgl'}
    <div class="state"><strong>3D view unavailable</strong><span>This browser or device has WebGL disabled. All data remains available in the panels and the Map view.</span></div>
  {:else if status === 'error'}
    <div class="state"><strong>3D view failed to load</strong><span>{err}</span></div>
  {/if}
</div>

<style>
  .scene { position: absolute; inset: 0; overflow: hidden; background: #e4e7ec; z-index: 0; isolation: isolate; }
  .scene.clay { background: #dfe8f5; }
  .state { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--muted); text-align: center; padding: 20px; }
  .state strong { color: var(--ink); }
  .spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid rgba(242,107,29,.2); border-top-color: var(--brand); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
