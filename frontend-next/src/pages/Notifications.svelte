<script>
  import { db } from '../lib/store.svelte.js';
  import { ago, ist, notifText, notifGroup, notifTone, statusLabel } from '../lib/format.js';
  import { markAllRead, unreadCount, notes } from '../lib/store.svelte.js';
  import { parseTs } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  let kind = $state('all');
  // channel groups: the log stores call_queued / call_reminder / call_reminder_level2 / review / email kinds
  let rows = $derived(db.notifications.filter((x) => kind === 'all' || notifGroup(x) === kind));
  const columns = [
    { key: 'timestamp_utc', label: 'Time', custom: true }, { key: 'kind', label: 'Channel', custom: true }, { key: 'target', label: 'Target' },
    { key: 'details', label: 'Details', custom: true }, { key: 'request_id', label: 'Ticket', custom: true }, { key: 'result', label: 'Result', custom: true }
  ];
</script>
<PageHead title="Notifications" eyebrow="Support">
  {#snippet actions()}{#if unreadCount()}<button class="btn" onclick={markAllRead}><Icon name="check" size={14} />Mark all as read</button>{/if}<div class="seg">{#each [['all', 'All'], ['call', 'Calls'], ['review', 'Reviews'], ['email', 'Email']] as [k, l]}<button class:on={kind === k} onclick={() => (kind = k)}>{l}</button>{/each}</div>{/snippet}
</PageHead>
<div class="panel panel-pad">
  <DataTable id="notifications" {rows} {columns} pageSize={15}>
    {#snippet cell(r, c)}
      {#if c.key === 'timestamp_utc'}<span title={ist(r.timestamp_utc)}>{ago(r.timestamp_utc)}</span>
      {:else if c.key === 'kind'}<span class="row" class:unread={(parseTs(r.timestamp_utc)?.getTime() || 0) > notes.seen}><Icon name={notifGroup(r) === 'email' ? 'mail' : notifGroup(r) === 'review' ? 'check' : 'phone'} size={13} />{notifText(r).kind}</span>
      {:else if c.key === 'details'}<span class="det"><b>{notifText(r).msg || '—'}</b>{#if notifText(r).exe}<small>via {notifText(r).exe}</small>{/if}</span>
      {:else if c.key === 'request_id'}<span class="mono">{r.request_id ? 'SH-' + String(r.request_id).replace(/-/g, '').slice(0, 12).toUpperCase() : '—'}</span>
      {:else if c.key === 'result'}<Badge status={notifTone(r)} label={statusLabel(String(r.result || ''))} />{/if}
    {/snippet}
  </DataTable>
</div>

<style>
  .det { display: grid; line-height: 1.3; } .det small { color: var(--muted); font-size: 11px; }
  .unread { font-weight: 700; } .unread::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); margin-left: 4px; }
</style>
