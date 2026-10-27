<script>
  // Lazy-loads the UNext L1 Support Hub 3D scene (Three.js is only downloaded here).
  import { onMount } from 'svelte';
  let { data, story = null, selected = null, onselect = () => {}, onstep = () => {}, reserve = '', paused = false, onstatus = () => {} } = $props();
  let host, scene = $state(null), status = $state('loading'), err = $state('');
  onMount(() => {
    let dead = false;
    let gl = false; try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch {}
    if (!gl) { status = 'nowebgl'; onstatus(status); return; }
    import('../three/SupportHubScene.js').then(({ SupportHubScene }) => {
      if (dead) return;
      try { const q = new URLSearchParams(location.search).get('q') || undefined; scene = new SupportHubScene(host, { data, reserve, quality: q, onSelect: (s) => onselect(s), onStep: (s) => onstep(s) }); window.__hub = scene; status = 'ready'; }
      catch (e) { status = 'error'; err = e?.message || String(e); }
      onstatus(status);
    }).catch((e) => { status = 'error'; err = e?.message || String(e); onstatus(status); });
    return () => { dead = true; scene?.dispose(); scene = null; if (window.__hub) window.__hub = null; };
  });
  $effect(() => { if (scene && data) scene.setData(data); });
  $effect(() => { if (scene) scene.setStory(story); });
  $effect(() => { if (scene) scene.select(selected); });
  $effect(() => { if (scene) scene.paused = paused; });
  export function reset() { scene?.resetView(); }
</script>
<div class="scene" bind:this={host} role="img" aria-label="Interactive 3D view of the UNext L1 Support Hub, admissions journey zones and ticket lifecycle zones. A 2D alternative is available.">
  {#if status === 'loading'}<div class="state"><div class="spinner"></div><span>Loading 3D support hub…</span></div>
  {:else if status === 'nowebgl'}<div class="state"><strong>3D view unavailable</strong><span>Use the 2D view for the same information.</span></div>
  {:else if status === 'error'}<div class="state"><strong>3D view failed to load</strong><span>{err}</span></div>{/if}
</div>
<style>
  .scene { position: absolute; inset: 0; overflow: hidden; background: #e9e6e2; isolation: isolate; }
  .state { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--muted); text-align: center; padding: 20px; }
  .state strong { color: var(--ink); }
  .spinner { width: 32px; height: 32px; border-radius: 50%; border: 3px solid rgba(242,107,29,.2); border-top-color: var(--brand); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
