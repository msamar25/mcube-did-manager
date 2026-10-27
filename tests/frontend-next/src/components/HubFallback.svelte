<script>
  // Static stand-in for the login's 3D hub (small screens, reduced motion, no WebGL):
  // the glowing UNext "u" on its platform, ringed by the four ticket stages.
  const ZONES = [['Incoming', '#f5a524', 'tl'], ['In progress', '#3b82f6', 'tr'], ['Failed', '#ef4444', 'bl'], ['Resolved', '#22c55e', 'br']];
</script>
<div class="hf" aria-hidden="true">
  <div class="ring r2"></div><div class="ring r1"></div>
  <div class="hub">
    <svg viewBox="0 0 40 40"><defs><linearGradient id="hfu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa733" /><stop offset="1" stop-color="#e63a1c" /></linearGradient></defs>
      <path d="M6 6h8v16c0 4 2.5 6.5 6 6.5S26 26 26 22V6h8v16.5C34 31 28 36 20 36S6 31 6 22.5z" fill="url(#hfu)" /></svg>
    <b>UNext SupportHub</b><small>L1 Support Team</small>
  </div>
  {#each ZONES as [l, c, pos]}<span class="z {pos}" style="--c:{c}"><i></i>{l}</span>{/each}
</div>
<style>
  .hf { position: relative; width: min(100%, 420px); aspect-ratio: 1.15; margin: 0 auto; display: grid; place-items: center; }
  .ring { position: absolute; border-radius: 50%; border: 2px solid rgba(255,138,61,.55); box-shadow: 0 0 24px rgba(255,138,61,.35); }
  .r1 { width: 58%; aspect-ratio: 1; } .r2 { width: 78%; aspect-ratio: 1; border-color: rgba(255,138,61,.25); }
  .hub { position: relative; display: grid; justify-items: center; gap: 2px; padding: 18px 22px; border-radius: 24px; background: radial-gradient(circle at 50% 40%, #fff 0%, #fff4ea 70%); box-shadow: 0 0 0 8px rgba(255,138,61,.12), 0 18px 40px -18px rgba(242,107,29,.7); }
  .hub svg { width: 64px; height: 64px; filter: drop-shadow(0 6px 14px rgba(242,107,29,.45)); }
  .hub b { font-size: 15px; } .hub small { font-size: 11.5px; color: var(--muted); }
  .z { position: absolute; display: inline-flex; gap: 6px; align-items: center; padding: 6px 11px; border-radius: 10px; background: #fff; font-size: 12px; font-weight: 650; box-shadow: 0 6px 18px -10px rgba(20,26,38,.4); border: 1px solid color-mix(in srgb, var(--c) 35%, #fff); }
  .z i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .tl { top: 6%; left: 2%; } .tr { top: 6%; right: 2%; } .bl { bottom: 6%; left: 2%; } .br { bottom: 6%; right: 2%; }
</style>
