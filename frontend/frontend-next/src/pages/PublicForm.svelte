<script>
  // Redesign of the agent-facing public support form (/support-request).
  // Same fields as production: agent_number, employee_name, email, issue_summary, website honeypot, Turnstile.
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import UnextLogo from '../components/UnextLogo.svelte';
  let f = $state({ agent_number: '', employee_name: '', email: '', issue_summary: '' }), sent = $state(false), err = $state('');
  function submit(e) {
    e.preventDefault(); err = '';
    if (!/^\d{10,20}$/.test(f.agent_number.replace(/\D/g, ''))) return (err = 'Enter the mobile number configured in MCube.');
    if (f.employee_name.trim().length < 2) return (err = 'Enter your registered full name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return (err = 'Enter your LSQ login email address.');
    if (f.issue_summary.trim().length < 10) return (err = 'Describe the issue in at least 10 characters.');
    sent = true;
  }
</script>

<PageHead title="Public Request Form" eyebrow="Support" />

<div class="wrap">
  <div class="phone">
    <div class="screen">
      <div class="top"><UnextLogo height={22} /><div><b>SupportHub</b><small>Calling-number support request</small></div></div>
      {#if sent}
        <div class="ok">
          <span class="okc"><Icon name="ok" size={28} /></span>
          <h3>Request received</h3>
          <p>Your ticket number is</p>
          <b class="mono tk">SH-PREVIEW0001</b>
          <p class="muted">You'll be contacted when your DID is replaced.</p>
          <button class="btn" onclick={() => { sent = false; f = { agent_number: '', employee_name: '', email: '', issue_summary: '' }; }}>Submit another</button>
        </div>
      {:else}
        <form onsubmit={submit}>
          <label class="field">MCube registered mobile number<input class="input" inputmode="numeric" placeholder="Number configured in MCube" bind:value={f.agent_number} /></label>
          <label class="field">Employee name<input class="input" placeholder="Registered full name" bind:value={f.employee_name} /></label>
          <label class="field">LSQ login email address<input class="input" type="email" placeholder="name@company.com" bind:value={f.email} /></label>
          <label class="field">Describe the issue<textarea class="input" rows="4" placeholder="Describe what happened (do not share passwords or PINs)" bind:value={f.issue_summary}></textarea><small>{f.issue_summary.length}/500</small></label>
          <input class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" name="website" />
          <div class="ts"><Icon name="shieldok" size={16} /><span>Security check (Cloudflare Turnstile)</span><span class="ck"><Icon name="check" size={13} /></span></div>
          {#if err}<div class="note bad" role="alert"><Icon name="alert" size={14} />{err}</div>{/if}
          <button class="btn btn-primary big">Submit request<Icon name="arrow" size={14} /></button>
        </form>
      {/if}
    </div>
  </div>
</div>

<style>
  .wrap { display: grid; grid-template-columns: minmax(0, 440px); gap: 16px; align-items: start; }
  .phone { border-radius: 36px; padding: 12px; background: linear-gradient(160deg, #2a303c, #141a26); box-shadow: var(--shadow-lg); }
  .screen { border-radius: 26px; background: linear-gradient(180deg, #fff6ef 0%, #fff 30%); padding: 18px; min-height: 560px; display: grid; align-content: start; gap: 14px; }
  .top { display: flex; gap: 10px; align-items: center; } .top div { display: grid; line-height: 1.2; } .top small { color: var(--muted); font-size: 11.5px; }
  form { display: grid; gap: 11px; }
  .input { width: 100%; height: 38px; font-size: 13px; } textarea.input { height: auto; resize: vertical; }
  .field small { justify-self: end; }
  .hp { position: absolute; left: -9999px; }
  .ts { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; color: var(--ink-2); background: #fafbfc; }
  .ts :global(svg) { color: var(--ok); } .ck { margin-left: auto; width: 20px; height: 20px; border-radius: 5px; background: var(--ok); display: grid; place-items: center; } .ck :global(svg) { color: #fff; }
  .big { height: 42px; }
  .ok { display: grid; justify-items: center; text-align: center; gap: 8px; padding-top: 30px; }
  .okc { width: 60px; height: 60px; border-radius: 50%; background: var(--ok-50); color: var(--ok); display: grid; place-items: center; }
  .tk { font-size: 18px; background: var(--brand-50); padding: 6px 12px; border-radius: 10px; color: var(--brand-600); }
  @media (max-width: 900px) { .wrap { grid-template-columns: minmax(0, 1fr); } .phone { max-width: 400px; justify-self: center; width: 100%; } }
</style>
