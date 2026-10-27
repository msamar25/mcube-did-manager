<script>
  import { db } from '../lib/store.svelte.js';
  import { ago, ist } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  let kind = $state('all');
  let rows = $derived(db.notifications.filter((x) => kind === 'all' || x.kind === kind));
  const columns = [
    { key: 'timestamp_utc', label: 'Time', custom: true }, { key: 'kind', label: 'Channel', custom: true }, { key: 'target', label: 'Target' },
    { key: 'details', label: 'Details', strong: true }, { key: 'request_id', label: 'Request', mono: true }, { key: 'result', label: 'Result', custom: true }
  ];
</script>
<PageHead title="Notifications" sub="Call and email notifications sent for requests (Notification_Log)" eyebrow="Support">
  {#snippet actions()}<div class="seg">{#each [['all', 'All'], ['call', 'Calls'], ['email', 'Email']] as [k, l]}<button class:on={kind === k} onclick={() => (kind = k)}>{l}</button>{/each}</div>{/snippet}
</PageHead>
<div class="panel panel-pad">
  <DataTable {rows} {columns} pageSize={15}>
    {#snippet cell(r, c)}
      {#if c.key === 'timestamp_utc'}<span title={ist(r.timestamp_utc)}>{ago(r.timestamp_utc)}</span>
      {:else if c.key === 'kind'}<span class="row"><Icon name={r.kind === 'email' ? 'mail' : 'phone'} size={13} />{r.kind}</span>
      {:else if c.key === 'result'}<Badge status={r.result === 'SUCCESS' ? 'ok' : 'bad'} label={r.result} />{/if}
    {/snippet}
  </DataTable>
</div>
