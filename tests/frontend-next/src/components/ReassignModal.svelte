<script>
  // Confirmation + live progress for sequential FIFO reassignment.
  // LIVE: submits to the existing backend queue (/api/requests/reassign for requests, /api/reassign for
  //       DIDs picked from inventory). The backend picks the FIFO DID, checks recent replacements,
  //       re-reads MCube before every agent, verifies, and journals each step. This dialog only shows it.
  // PREVIEW: a visual simulation; nothing is sent.
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';
  import OpChip from './OpChip.svelte';
  import { db, refresh } from '../lib/store.svelte.js';
  import { LIVE, reassignDids, reassignRequests, getQueue, getBatch } from '../lib/data/source.js';
  import { toast } from './Toast.svelte';
  let { open = false, items = [], requestIds = null, onclose = () => {} } = $props();

  const STEPS = ['Fresh inventory', 'Deactivate', 'Activate', 'Verify', 'Logged'];
  let ack = $state(false), phase = $state('confirm'), error = $state(''), queueId = $state(''), queueStatus = $state(''), batch = $state(null), progress = $state({});
  let pool = $derived(db.inventory.filter((i) => i.status === 'pool').sort((a, b) => (a.fifo ?? 1e9) - (b.fifo ?? 1e9)));
  let livePlan = $derived(items.slice(0, pool.length).map((it, k) => ({ ...it, next: pool[k] })));
  // frozen at submit time, so later inventory refreshes don't rewrite what was shown/submitted
  let frozen = $state(null);
  let plan = $derived(frozen ?? livePlan);
  let resultOf = $derived(new Map((batch?.results || []).map((r) => [String(r.old), r])));
  let timer = null;
  $effect(() => { if (open) { frozen = null; ack = false; phase = 'confirm'; error = ''; queueId = ''; queueStatus = ''; batch = null; progress = {}; } else stop(); });
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  async function submit() {
    error = ''; frozen = livePlan.map((p) => ({ ...p })); phase = 'submitting';
    if (!LIVE) return simulate();
    try {
      const r = requestIds?.length ? await reassignRequests(requestIds) : await reassignDids(plan.map((p) => p.did));
      queueId = r.queue_id; queueStatus = r.status || 'pending'; phase = 'running';
      poll(); timer = setInterval(poll, 2000);
    } catch (e) { error = e.message; phase = 'confirm'; frozen = null; }
  }
  async function poll() {
    try {
      const [q, b] = await Promise.all([getQueue(), getBatch()]);
      const job = (q.items || []).find((j) => j.queue_id === queueId);
      if (job) queueStatus = job.status;
      if (b && (b.running || b.results?.length)) batch = b;
      if (['completed', 'needs_reconciliation', 'cancelled'].includes(queueStatus)) {
        stop(); phase = 'done';
        const ok = (batch?.results || []).filter((r) => r.status === 'success').length;
        if (queueStatus === 'completed' && !batch?.error) toast(`Replacement finished · ${ok} of ${plan.length} agent${plan.length === 1 ? '' : 's'} updated`);
        else toast('Replacement stopped — needs an administrator to reconcile in MCube (see Settings → Advanced)', 'bad');
        refresh(true);
      }
    } catch (e) { error = e.message; }
  }
  async function simulate() {
    phase = 'running';
    for (const p of plan) for (let s = 0; s < STEPS.length; s++) { progress[p.did] = s + 1; await new Promise((r) => setTimeout(r, 160)); }
    phase = 'done';
    toast(`Simulation finished for ${plan.length} agent${plan.length === 1 ? '' : 's'} — no changes made`);
  }
  function rowState(p) {
    if (!LIVE) return progress[p.did] ? STEPS[progress[p.did] - 1] : 'Queued';
    const r = resultOf.get(String(p.did));
    if (r) return r.status === 'success' ? `Done → ${r.new}` : r.status === 'failed' ? `Failed at ${r.stage}: ${r.reason || ''}` : `Stopped: ${r.reason || ''}`;
    if (phase === 'running') return queueStatus === 'pending' ? 'Waiting in queue' : batch?.running ? 'In progress…' : 'Starting…';
    return 'Ready';
  }
  const tone = (p) => { const r = resultOf.get(String(p.did)); return r ? (r.status === 'success' ? 'ok' : 'bad') : ''; };
</script>

<Modal {open} onclose={() => { if (phase !== 'running' && phase !== 'submitting') onclose(); }} title="Reassign {plan.length} agent{plan.length === 1 ? '' : 's'} · FIFO" width={680}>
  {#if !LIVE}<div class="note warn"><Icon name="info" size={15} /><span>Preview: simulation only.</span></div>{/if}
  {#if items.length > pool.length}<div class="note bad"><Icon name="alert" size={15} />Only {pool.length} DIDs are available in the pool. {items.length - pool.length} selected agent{items.length - pool.length === 1 ? '' : 's'} will not be included.</div>{/if}
  {#if error}<div class="note bad" role="alert"><Icon name="alert" size={15} /><span>{error}</span></div>{/if}
  {#if phase === 'running' || phase === 'done'}
    <div class="note {queueStatus === 'needs_reconciliation' ? 'bad' : phase === 'done' ? '' : 'warn'}"><Icon name={phase === 'done' ? 'check' : 'clock'} size={15} /><span>
      {#if phase === 'done'}{queueStatus === 'completed' ? 'Finished.' : 'Stopped for reconciliation. Check the agent in MCube, then acknowledge the batch in Settings → Advanced.'}
      {:else}{queueStatus === 'pending' ? 'Queued — waiting for the worker.' : `Working… ${batch?.done ?? 0} of ${batch?.total ?? plan.length} done.`}{/if}
    </span></div>
  {/if}
  <div class="plan scroll-y">
    <table class="tbl">
      <thead><tr><th>Agent</th><th>Current DID</th><th></th><th>Next FIFO DID</th><th>Progress</th></tr></thead>
      <tbody>
        {#each plan as p}
          <tr>
            <td class="strong">{p.agent}<div class="muted small">{p.agent_number}</div></td>
            <td class="mono">{p.did}<div><OpChip name={p.operator} /></div></td>
            <td><Icon name="arrow" size={14} /></td>
            <td class="mono">{p.next?.did}<div class="muted small">FIFO #{p.next?.fifo} · {p.next?.operator}</div></td>
            <td class="st {tone(p)}">{#if !LIVE}<div class="steps">{#each STEPS as s, i}<span class:on={(progress[p.did] || 0) > i} title={s}></span>{/each}</div>{/if}<small>{rowState(p)}</small></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if phase === 'confirm'}<label class="ack"><input type="checkbox" bind:checked={ack} /> Confirm replacement</label>{/if}
  {#snippet footer()}
    <button class="btn" disabled={phase === 'running' || phase === 'submitting'} onclick={onclose}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
    {#if phase !== 'done'}<button class="btn btn-primary" disabled={!ack || phase !== 'confirm' || !plan.length} onclick={submit}><Icon name="play" size={14} />{phase === 'submitting' ? 'Submitting…' : phase === 'running' ? 'Running…' : LIVE ? 'Start replacement' : 'Run simulation'}</button>{/if}
  {/snippet}
</Modal>
<style>
  .plan { max-height: 260px; border: 1px solid var(--line); border-radius: 12px; }
  .small { font-size: 11px; }
  .steps { display: flex; gap: 3px; margin-bottom: 2px; } .steps span { width: 14px; height: 5px; border-radius: 3px; background: var(--line); transition: background .2s; } .steps span.on { background: var(--ok); }
  .st small { display: block; max-width: 210px; } .st.ok small { color: var(--ok); font-weight: 650; } .st.bad small { color: var(--bad); font-weight: 650; }
  .checks { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .checks li { display: flex; gap: 6px; align-items: flex-start; } .checks :global(svg) { color: var(--ok); flex: none; margin-top: 1px; }
  .ack { display: flex; gap: 8px; align-items: center; font-weight: 600; font-size: 12.5px; } .ack input { accent-color: var(--brand); width: 15px; height: 15px; }
  @media (max-width: 600px) { .checks { grid-template-columns: 1fr; } }
</style>
