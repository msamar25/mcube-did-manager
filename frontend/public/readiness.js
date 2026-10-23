(function () {
  'use strict';
  const base = String(window.UNEXT_API_BASE || '').trim().replace(/\/+$/, '');
  const isForm = location.pathname.replace(/\/+$/, '') === '/support-request';
  const overlay = document.createElement('div');
  overlay.id = 'unext-readiness';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="unext-boot-card">
      <div class="unext-boot-brand"><div class="unext-boot-icon" aria-hidden="true">♧</div>
        <div><strong>UNext SupportHub</strong><small>Secure support workspace</small></div></div>
      <div class="unext-boot-art" id="unext-boot-art"><span class="unext-boot-fallback" aria-hidden="true"></span></div>
      <h1>Preparing your workspace</h1>
      <p id="unext-boot-text">Checking secure services…</p>
      <div class="unext-boot-steps">
        <div id="unext-step-interface" class="unext-step pending"><span class="unext-step-symbol">○</span> Application interface</div>
        <div id="unext-step-backend" class="unext-step pending"><span class="unext-step-symbol">○</span> Secure backend connection</div>
        <div id="unext-step-dashboard" class="unext-step pending"><span class="unext-step-symbol">○</span> ${isForm ? 'Support form' : 'Dashboard'} ready</div>
      </div>
      <button id="unext-boot-retry" type="button" hidden>Retry connection</button>
      <p class="unext-boot-foot">Your session and saved requests are not changed by this screen.</p>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    #unext-readiness{position:fixed;inset:0;z-index:999999;background:#fff;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1e293b;box-sizing:border-box}
    #unext-readiness[hidden]{display:none!important}
    #unext-readiness *{box-sizing:border-box}
    .unext-boot-card{width:min(100%,470px);text-align:center;padding:30px 24px;border:1px solid #eef0f4;border-radius:20px;background:#fff;box-shadow:0 20px 65px #17223a0c}
    .unext-boot-brand{display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:6px;text-align:left}
    .unext-boot-brand strong{display:block;font-size:19px;letter-spacing:-.5px;color:#202b3e}
    .unext-boot-brand small{display:block;color:#8691a3;font-size:11px;margin-top:2px}
    .unext-boot-icon{width:43px;height:43px;border-radius:13px;background:#ff6600;color:white;font-size:32px;line-height:43px;text-align:center}
    .unext-boot-art{height:145px;display:flex;align-items:center;justify-content:center;margin:5px auto}
    .unext-boot-art svg{max-width:100%;max-height:100%}
    .unext-boot-fallback{width:64px;height:64px;border:5px solid #ffeadb;border-top-color:#ff6600;border-radius:50%;animation:unext-spin 1s linear infinite}
    .unext-boot-card h1{font-size:21px;line-height:1.3;margin:0 0 7px;font-weight:750;color:#1d2939}
    #unext-boot-text{font-size:13px;color:#667085;line-height:1.5;min-height:20px;margin:0 0 20px}
    .unext-boot-steps{background:#f8fafc;border:1px solid #eef2f6;border-radius:13px;padding:15px 19px;text-align:left;display:grid;gap:13px}
    .unext-step{display:flex;align-items:center;gap:10px;font-size:13px;color:#98a2b3}
    .unext-step-symbol{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;color:#98a2b3;flex:none}
    .unext-step.done{color:#344054}.unext-step.done .unext-step-symbol{color:#12a76a}
    .unext-step.active{color:#344054}.unext-step.active .unext-step-symbol{color:#ff6600;animation:unext-pulse 1.1s ease-in-out infinite}
    .unext-step.failed{color:#b42318}.unext-step.failed .unext-step-symbol{color:#b42318}
    #unext-boot-retry{margin-top:19px;background:#ff6600;border:0;border-radius:9px;color:#fff;padding:11px 23px;font-weight:700;cursor:pointer}
    #unext-boot-retry:hover{background:#df5800}
    .unext-boot-foot{font-size:11px;color:#98a2b3;margin:18px 0 0}
    @keyframes unext-spin{to{transform:rotate(360deg)}}@keyframes unext-pulse{50%{opacity:.35}}
    @media(max-width:520px){.unext-boot-card{padding:24px 17px}.unext-boot-art{height:118px}}
    @media(prefers-reduced-motion:reduce){.unext-boot-fallback,.unext-step.active .unext-step-symbol{animation:none}}
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  const text = overlay.querySelector('#unext-boot-text');
  const retry = overlay.querySelector('#unext-boot-retry');
  const steps = {
    interface: overlay.querySelector('#unext-step-interface'),
    backend: overlay.querySelector('#unext-step-backend'),
    dashboard: overlay.querySelector('#unext-step-dashboard')
  };
  function stage(name, state) {
    const el = steps[name];
    el.className = 'unext-step ' + state;
    el.querySelector('.unext-step-symbol').textContent =
      state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'active' ? '◌' : '○';
  }
  let frontendReady = isForm ? document.readyState !== 'loading' : !!window.__unextFrontendMounted;
  let backendReady = false, attempt = 0, generation = 0, timer = null;
  function finishIfReady() {
    if (!frontendReady || !backendReady) return;
    stage('dashboard', 'done');
    overlay.hidden = true;
    window.dispatchEvent(new Event('unext-backend-ready'));
  }
  function onFrontendReady() {
    frontendReady = true;
    stage('interface', 'done');
    stage('dashboard', backendReady ? 'done' : 'pending');
    finishIfReady();
  }
  if (frontendReady) onFrontendReady();
  else stage('interface', 'active');
  window.addEventListener('unext-frontend-ready', onFrontendReady);
  if (isForm && !frontendReady) document.addEventListener('DOMContentLoaded', onFrontendReady, {once:true});
  function schedule(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  async function check(gen) {
    if (gen !== generation || backendReady) return;
    if (!base || !/^https?:\/\//i.test(base)) {
      stage('backend', 'failed');
      text.textContent = 'Backend URL is not configured correctly. Contact support.';
      retry.hidden = false;
      return;
    }
    stage('backend', 'active');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(base + '/api/health', {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error('Service unavailable');
      const data = await response.json();
      if (data.status !== 'ok') throw new Error('Backend not ready');
      if (gen !== generation) return;
      backendReady = true;
      stage('backend', 'done');
      text.textContent = 'Connection established. Opening your workspace…';
      finishIfReady();
    } catch (_) {
      if (gen !== generation) return;
      attempt++;
      if (attempt >= 12) {
        stage('backend', 'failed');
        text.textContent = 'The server is taking longer than expected. Check your connection or try again.';
        retry.hidden = false;
        return;
      }
      text.textContent = attempt < 5 ? 'Waking up secure services. This can take a minute…' : 'Still connecting to secure services…';
      schedule(Math.min(2500 + attempt * 1000, 7000), () => check(gen));
    } finally { clearTimeout(timeout); }
  }
  retry.addEventListener('click', () => {
    generation++; attempt = 0; backendReady = false; retry.hidden = true;
    text.textContent = 'Retrying secure connection…';
    check(generation);
  });
  // Optional animation: never block the application or the health check on Lottie.
  // The requested animation JSON is fetched from the user-supplied LottieFiles URL.
  // CSS spinner remains visible if the external script or JSON is unavailable.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
    script.async = true;
    script.onload = () => {
      if (overlay.hidden || !window.lottie) return;
      const art = overlay.querySelector('#unext-boot-art');
      try {
        const anim = window.lottie.loadAnimation({
          container:art, renderer:'svg', loop:true, autoplay:true,
          path:'https://assets5.lottiefiles.com/packages/lf20_DMgKk1.json'
        });
        anim.addEventListener('DOMLoaded', () => {
          const fallback = art.querySelector('.unext-boot-fallback');
          if (fallback) fallback.remove();
        });
        anim.addEventListener('data_failed', () => {
          anim.destroy();
          if (!art.querySelector('.unext-boot-fallback')) {
            const spinner = document.createElement('span');
            spinner.className = 'unext-boot-fallback';
            art.appendChild(spinner);
          }
        });
      } catch (_) { /* Keep fallback spinner. */ }
    };
    document.head.appendChild(script);
  }
  check(generation);
})();