<script>
  // Ticket details: facts, review decision (with the Replacement permission), timeline. Used by
  // Support Requests and the Replacement Queue.
  import { can } from '../lib/session.svelte.js';
  import { go } from '../lib/router.svelte.js';
  import { refresh } from '../lib/store.svelte.js';
  import { getRequestTimeline, reviewRequest } from '../lib/data/source.js';
  import { isYes } from '../lib/calc.js';
  import { ist } from '../lib/format.js';
  import Drawer from './Drawer.svelte';
  import Icon from './Icon.svelte';
  import Badge from './Badge.svelte';
  import OpChip from './OpChip.svelte';
  import { toast } from './Toast.svelte';
  let { ticket = null, onclose = () => {} } = $props();
  const sources = { call: 'Call', form: 'Form', both: 'Call + Form', import: 'Imported', unknown: 'Unknown' };
  let tl = $state(null), reason = $state('Reviewed previous replacement'), reviewing = $state(false);
  $effect(() => { tl = null; if (ticket) getRequestTimeline(ticket.request_id).then((d) => (tl = d)).catch(() => (tl = { events: [] })); });
  async function review(approved) {
    reviewing = true;
    try { await reviewRequest(ticket.request_id, approved, reason.trim()); toast(approved ? 'Approved · ready for replacement' : 'Rejected · request closed'); onclose(); await refresh(); }
    catch (e) { toast(e.message, 'bad'); } finally { reviewing = false; }
  }
</script>
<Drawer open={!!ticket} title={ticket?.ticket_no || ''} sub="{ticket?.agent_name} · {ticket?.agent_number}" {onclose}>
  {#if ticket}
    <div class="grid2">
      <div class="kv"><small>Status</small><Badge status={ticket.status} /></div>
      <div class="kv"><small>Channel</small><b>{sources[ticket.request_source] || '—'}</b></div>
      <div class="kv"><small>Current DID</small><b class="mono">{ticket.current_did}</b></div>
      <div class="kv"><small>Operator</small><OpChip name={ticket.operator} /></div>
      <div class="kv"><small>Opened</small><b>{ist(ticket.first_call_utc)}</b></div>
      <div class="kv"><small>Reminders sent</small><b>{ticket.reminder_count}</b></div>
      {#if ticket.replacement_new_did}<div class="kv"><small>New DID</small><b class="mono">{ticket.replacement_new_did}</b></div><div class="kv"><small>Completed</small><b>{ist(ticket.completed_utc)}</b></div>{/if}
    </div>
    {#if can.reassign() && (ticket.status === 'review_required' || (ticket.status === 'pending' && isYes(ticket.recent_warning)))}
      <div class="panel panel-pad rv">
        <div class="panel-title">Review required</div>
        <p class="muted">Replaced recently. Approve or reject before it can be queued.</p>
        <label class="field">Reason (3–500 characters)<input class="input" bind:value={reason} maxlength="500" /></label>
        <div class="row"><button class="btn btn-primary" disabled={reviewing || reason.trim().length < 3} onclick={() => review(true)}>Approve</button><button class="btn btn-danger" disabled={reviewing || reason.trim().length < 3} onclick={() => review(false)}>Reject</button></div>
      </div>
    {/if}
    <div class="panel panel-pad">
      <div class="panel-title" style="margin-bottom:10px">Ticket timeline</div>
      {#if !tl}<div class="muted">Loading…</div>{:else}
        <div class="tl">{#each tl.events as e}<div class="ev"><span class="dot"></span><div><b>{e.event.replace(/_/g, ' ')}</b><small>{ist(e.timestamp_ist)} · {e.source} · {e.actor}</small><small>{e.details}</small></div></div>{/each}</div>
      {/if}
    </div>
    <button class="btn" onclick={() => go('command', 'agent', { n: ticket.agent_number })}><Icon name="agent" size={14} />Open Agent 360°</button>
  {/if}
</Drawer>
<style>
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kv { display: grid; gap: 3px; background: #f8f9fb; border-radius: 10px; padding: 8px 10px; justify-items: start; } .kv small { color: var(--muted); font-size: 11px; }
  .rv { display: grid; gap: 8px; border-color: #e5d4ff; background: #faf7ff; }
  .tl { display: grid; gap: 10px; }
  .ev { display: flex; gap: 10px; } .ev div { display: grid; font-size: 12px; } .ev small { color: var(--muted); font-size: 11px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); margin-top: 4px; flex: none; box-shadow: 0 0 0 3px var(--brand-50); }
  .field .input { width: 100%; height: 36px; }
</style>
