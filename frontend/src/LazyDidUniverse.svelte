<script>
 import { onMount } from 'svelte';
 let {operators=[],pending=0,onOperator=()=>{}}=$props();
 let Component=$state(null);
 let loadError=$state('');
 onMount(()=>{
   let active=true;
   import('./DidUniverse.svelte').then(m=>{if(active)Component=m.default}).catch(()=>{if(active)loadError='Unable to load the 3D view. Try refreshing this page.'});
   return()=>{active=false};
 });
</script>
{#if Component}
 <Component {operators} {pending} {onOperator}/>
{:else if loadError}
 <div class="v85-load-state" role="alert">{loadError}</div>
{:else}
 <div class="v85-load-state" role="status"><span class="v85-loader"></span>Preparing the interactive DID universe…</div>
{/if}
<style>
.v85-load-state{display:flex;align-items:center;justify-content:center;gap:12px;min-height:280px;border-radius:18px;background:#f8fafc;color:#526174;font-size:14px}
.v85-loader{height:22px;width:22px;border-radius:50%;border:3px solid #ffe3ce;border-top-color:#f97316;animation:v85-spin .8s linear infinite}
@keyframes v85-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.v85-loader{animation:none}}
</style>
