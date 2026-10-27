<script>
  // Production flow: email + PIN → one-time code by email (Brevo) → 8-hour session.
  // In design-preview builds nothing leaves the browser and any 6 digits are accepted.
  import { signIn, session, startLogin, verifyLogin } from '../lib/session.svelte.js';
  import { LIVE } from '../lib/data/source.js';
  import { api } from '../lib/data/api.js';
  import Icon from '../components/Icon.svelte';
  import UnextLogo from '../components/UnextLogo.svelte';
  import LifelineFallback from '../components/LifelineFallback.svelte';
  import { onMount } from 'svelte';

  let step = $state('creds'), email = $state(LIVE ? '' : 'admin@example-unext.in'), pin = $state(''), challenge = $state(''), expiresAt = $state(0), now = $state(Date.now()), otp = $state(''), role = $state('admin'), busy = $state(false), err = $state(''), show = $state(false);
  let stage, mode = $state('loading'), story = $state(null); // loading | live | static
  onMount(() => {
    let scene, dead = false;
    const small = matchMedia('(max-width: 900px)').matches || (navigator.deviceMemory || 8) <= 2, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let gl = false; try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch {}
    if (small || reduced || !gl) { mode = 'static'; return; }
    import('../three/LifelineScene.js').then(({ LifelineScene }) => { if (dead) return; try { scene = new LifelineScene(stage, { onStep: (x) => (story = x) }); window.__lifeline = scene; mode = 'live'; } catch { mode = 'static'; } }).catch(() => (mode = 'static'));
    return () => { dead = true; scene?.dispose(); };
  });

  // Render Free sleeps when idle; the first request can take ~50 s. Wake it while the user types.
  let server = $state(LIVE ? 'waking' : 'ready');
  onMount(() => {
    if (!LIVE) return;
    let dead = false;
    (async () => { for (let i = 0; i < 4 && !dead; i++) { try { await api('/api/health', { auth: false, timeout: 90000 }); server = 'ready'; return; } catch { server = 'waking'; } } if (!dead) server = 'down'; })();
    return () => { dead = true; };
  });
  function focusOnMount(node) { node.focus(); }
  $effect(() => { if (step !== 'otp') return; const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  let left = $derived(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
  async function submit(e) {
    e.preventDefault(); err = '';
    if (step === 'creds') {
      if (!/^\S+@\S+\.\S+$/.test(email)) return (err = 'Enter a valid work email.');
      if (pin.length < 4) return (err = 'Enter your PIN.');
      if (!LIVE) { busy = true; setTimeout(() => { busy = false; step = 'otp'; }, 500); return; }
      busy = true;
      try { const r = await startLogin(email, pin); server = 'ready'; challenge = r.challenge_id; expiresAt = Date.now() + Number(r.expires_in || 300) * 1000; now = Date.now(); pin = ''; otp = ''; step = 'otp'; }
      catch (x) { err = x.message || 'Unable to send the code.'; }
      finally { busy = false; }
    } else {
      otp = String(otp).replace(/\D/g, '').slice(0, 6);
      if (!/^\d{6}$/.test(otp)) return (err = 'Enter the 6-digit code sent to your email.');
      if (!LIVE) { busy = true; setTimeout(() => { busy = false; signIn(role); location.hash = '#/dashboard/overview'; }, 450); return; }
      if (left <= 0) return (err = 'The code has expired. Go back and request a new one.');
      busy = true;
      try { await verifyLogin(challenge, otp); location.hash = '#/dashboard/overview'; }
      catch (x) { err = x.message || 'Verification failed.'; otp = ''; }
      finally { busy = false; }
    }
  }
</script>

<div class="login">
  <section class="visual" aria-label="Illustrative animation of UNext support keeping the admissions journey moving">
    <div class="stage" bind:this={stage} class:hidden={mode === 'static'}></div>
    {#if mode === 'static'}<div class="fallback"><LifelineFallback /></div>{/if}
    {#if mode === 'loading'}<div class="loading"><span></span>Loading 3D view…</div>{/if}
    <div class="caption">
      <span class="eyebrow">UNext operations lifeline</span>
      <p>Admissions and enrollment support for MAHE, MUJ and SMU online programmes.</p>
      {#if story}
        <div class="steps" aria-live="off">
          {#each ['Journey', 'Issue', 'Ticket', 'L1 resolving', 'Resolved', 'Enrolled'] as l, i}<span class:on={story.phase === i} class:done={story.phase > i} class:warn={i === 1 || i === 2}>{l}</span>{/each}
        </div>
      {/if}
    </div>
    <span class="illus">Illustrative loop · not live cases</span>
  </section>

  <section class="panel-side">
    <form class="card" onsubmit={submit}>
      <div class="brand"><UnextLogo height={28} /><span class="sep"></span><span class="prod">SupportHub</span></div>
      <div class="ch"><h1>Welcome back</h1><p>Keeping every enrollment journey moving.</p></div>
      {#if step === 'creds'}
        <label class="field">Work email
          <span class="ip"><Icon name="mail" size={15} /><input class="input" type="email" bind:value={email} autocomplete="username" required /></span>
        </label>
        <label class="field">PIN
          <span class="ip"><Icon name="lock" size={15} /><input class="input" type={show ? 'text' : 'password'} inputmode="numeric" bind:value={pin} autocomplete="current-password" placeholder="Enter your PIN" required />
            <button type="button" class="eye" onclick={() => (show = !show)} aria-label={show ? 'Hide PIN' : 'Show PIN'}><Icon name="eye" size={15} /></button></span>
        </label>
        {#if !LIVE}<div class="field"><span>Preview as</span>
          <div class="seg"><button type="button" class:on={role === 'admin'} aria-pressed={role === 'admin'} onclick={() => (role = 'admin')}>Administrator</button><button type="button" class:on={role === 'operator'} aria-pressed={role === 'operator'} onclick={() => (role = 'operator')}>Operator</button></div>
        </div>{/if}
      {:else}
        <div class="note"><Icon name="mail" size={15} /><span>We sent a 6-digit code to <b>{email}</b>. {#if LIVE}{left > 0 ? `It expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.` : 'It has expired.'}{:else}It expires in 5 minutes.{/if}</span></div>
        <label class="field">One-time code
          <input class="input otp" inputmode="numeric" maxlength="6" bind:value={otp} placeholder="6-digit code" autocomplete="one-time-code" use:focusOnMount aria-label="One-time code" />
        </label>
        <button type="button" class="link" onclick={() => (step = 'creds')}>← Use a different email</button>
      {/if}
      {#if LIVE && server !== 'ready' && step === 'creds'}<div class="note {server === 'down' ? 'bad' : ''}" role="status"><Icon name={server === 'down' ? 'alert' : 'clock'} size={15} />{server === 'down' ? 'The server is not responding. Please try again in a minute.' : 'Waking up the server… this can take up to a minute after a quiet period.'}</div>{/if}
      {#if session.expiredMessage && step === 'creds' && !err}<div class="note warn" role="status"><Icon name="clock" size={15} />{session.expiredMessage}</div>{/if}
      {#if err}<div class="note bad" role="alert"><Icon name="alert" size={15} />{err}</div>{/if}
      <button class="btn btn-primary big" disabled={busy}>{busy ? 'Please wait…' : step === 'creds' ? 'Continue' : 'Verify & sign in'}<Icon name="arrow" size={15} /></button>
      {#if LIVE}<p class="fine">For authorised UNext staff. Codes are sent by email and expire after 5 minutes; sessions last 8 hours.</p>
      {:else}<p class="fine"><span class="demo-flag">Design preview</span> Any email, any PIN of 4+ digits and any 6-digit code work here. Nothing is sent.</p>{/if}
    </form>
    <footer>© UNext · Internal operations portal</footer>
  </section>
</div>

<style>
  .login { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 58fr) minmax(380px, 42fr); background: #f4f2ef; }
  .visual { position: relative; margin: 14px 0 14px 14px; border-radius: 24px; overflow: hidden;
    background: radial-gradient(900px 600px at 40% 30%, #ffffff 0%, #f6efe8 55%, #eadfd4 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.8); }
  .stage { position: absolute; inset: 0; } .stage.hidden { display: none; }
  .fallback { position: absolute; inset: 8% 6% 18%; }
  .loading { position: absolute; inset: 0; display: grid; place-content: center; gap: 10px; justify-items: center; color: var(--muted); font-size: 12px; }
  .loading span { width: 30px; height: 30px; border-radius: 50%; border: 3px solid rgba(242,107,29,.2); border-top-color: var(--brand); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .caption { position: absolute; left: 28px; bottom: 26px; max-width: 440px; display: grid; gap: 4px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,.72); backdrop-filter: blur(12px); box-shadow: 0 10px 30px -20px rgba(20,26,38,.4); }
  .caption p { font-size: 13px; color: var(--ink-2); }
  .steps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .steps span { font-size: 10.5px; font-weight: 650; padding: 3px 8px; border-radius: 99px; background: #eef0f3; color: #7a8395; transition: background .3s, color .3s; }
  .steps span.done { background: #e7f7ee; color: #0b7a3b; }
  .steps span.on { background: #fff1e6; color: #c2540a; box-shadow: inset 0 0 0 1px #f8c9a8; }
  .steps span.on.warn { background: #fff4e0; color: #a35f00; box-shadow: inset 0 0 0 1px #f4cf8f; }
  .illus { position: absolute; right: 18px; bottom: 18px; font-size: 10.5px; color: var(--muted); background: rgba(255,255,255,.7); padding: 3px 8px; border-radius: 6px; }
  .panel-side { display: grid; grid-template-rows: 1fr auto; padding: 24px 40px; background: #fff; }
  .card { align-self: center; display: grid; gap: 15px; width: 100%; max-width: 360px; justify-self: center; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .sep { width: 1px; height: 20px; background: var(--line); } .prod { font-weight: 700; font-size: 16px; letter-spacing: -.02em; color: #3a3f4a; }
  .ch h1 { font-size: 28px; letter-spacing: -.035em; line-height: 1.1; } .ch p { color: var(--muted); font-size: 14px; margin-top: 4px; }
  .ip { position: relative; display: flex; align-items: center; }
  .ip > :global(svg) { position: absolute; left: 11px; color: var(--faint); }
  .ip .input { width: 100%; height: 44px; padding-left: 34px; font-size: 14px; border-radius: 11px; background: #fafafa; }
  .eye { position: absolute; right: 6px; border: 0; background: none; color: var(--muted); padding: 6px; }
  .otp { height: 48px; font-size: 22px; letter-spacing: .5em; text-align: center; font-weight: 700; }
  .big { height: 46px; font-size: 14.5px; border-radius: 12px; }
  .link { border: 0; background: none; color: var(--brand-600); font-weight: 600; justify-self: start; padding: 0; }
  .fine { font-size: 11.5px; color: var(--muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .field .seg { width: 100%; } .field .seg button { flex: 1; }
  footer { font-size: 11px; color: var(--faint); text-align: center; }
  :global(.ll-label) { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 99px; background: rgba(255,255,255,.94); color: #141a26; font: 650 11.5px 'Inter Variable', Inter, sans-serif; white-space: nowrap; box-shadow: 0 8px 18px -10px rgba(20,26,38,.45), inset 0 0 0 1px rgba(20,26,38,.06); }
  :global(.ll-label i) { font-style: normal; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: #2a6fdb; color: #fff; font-size: 10px; font-weight: 800; }
  :global(.ll-label.hub) { background: #141a26; color: #fff; font-size: 12.5px; padding: 5px 12px 5px 5px; }
  :global(.ll-label i.hub) { width: auto; padding: 0 6px; border-radius: 8px; background: linear-gradient(135deg,#ff9a4d,#f26b1d); height: 20px; }
  :global(.eco-label) { display: grid; justify-items: center; padding: 5px 12px 6px; border-radius: 12px; background: rgba(17,21,30,.88); color: #fff; font-family: 'Inter Variable', Inter, sans-serif; box-shadow: 0 10px 22px -10px rgba(0,0,0,.5); white-space: nowrap; line-height: 1.15; }
  :global(.eco-label b) { font-size: 15px; font-weight: 800; letter-spacing: .04em; }
  :global(.eco-label small) { font-size: 10px; opacity: .75; }
  :global(.eco-label.blue) { box-shadow: inset 0 -2px 0 #4a8cff, 0 10px 22px -10px rgba(0,0,0,.5); }
  :global(.eco-label.orange) { box-shadow: inset 0 -2px 0 #ff8a3d, 0 10px 22px -10px rgba(0,0,0,.5); }
  :global(.eco-label.green) { box-shadow: inset 0 -2px 0 #34d399, 0 10px 22px -10px rgba(0,0,0,.5); }
  :global(.eco-label.hub) { background: rgba(255,255,255,.95); color: #141a26; box-shadow: 0 10px 24px -10px rgba(20,26,38,.4), inset 0 -2px 0 #ff8a3d; }
  :global(.eco-u) { display: block; width: 84px; height: 22px; color: #0b0b0b; } :global(.eco-u svg) { width: 100%; height: 100%; }
  @media (max-width: 1100px) { .panel-side { padding: 24px; } }
  @media (max-width: 900px) {
    .login { grid-template-columns: 1fr; }
    .visual { margin: 10px 10px 0; height: 240px; border-radius: 18px; } .caption, .illus { display: none; } .fallback { inset: 4%; }
    .panel-side { padding: 22px 20px; } .brand { margin-bottom: 6px; } .ch h1 { font-size: 24px; }
  }
</style>
