<script>
  // Audit: User Management changes (Platform_Audit) and every sign-in / change request (User_Activity_Logs).
  import { getPlatformAudit, getAccessLog } from '../../lib/data/platform.js';
  import { ist } from '../../lib/format.js';
  import PageHead from '../../components/PageHead.svelte';
  import DataTable from '../../components/DataTable.svelte';
  import Badge from '../../components/Badge.svelte';
  import Icon from '../../components/Icon.svelte';
  let tab = $state('changes'), changes = $state([]), access = $state([]), error = $state(''), loading = $state(true);
  Promise.allSettled([getPlatformAudit(), getAccessLog()]).then(([a, b]) => {
    if (a.status === 'fulfilled') changes = a.value.items; else error = a.reason?.message;
    if (b.status === 'fulfilled') access = b.value.items; else error = b.reason?.message;
    loading = false;
  });
  const C1 = [
    { key: 'time_ist', label: 'Time', value: (r) => r.time_ist, format: (v) => ist(v), minWidth: '150px' },
    { key: 'actor', label: 'By' }, { key: 'action', label: 'Action', mono: true }, { key: 'target', label: 'Target' }, { key: 'details', label: 'Details' }
  ];
  const C2 = [
    { key: 'time_ist', label: 'Time', value: (r) => r.time_ist, format: (v) => ist(v), minWidth: '150px' },
    { key: 'email', label: 'User' }, { key: 'role', label: 'Role' }, { key: 'action', label: 'Action', mono: true }, { key: 'endpoint', label: 'Endpoint', mono: true },
    { key: 'result', label: 'Result', custom: true, value: (r) => r.result }
  ];
</script>

<PageHead title="Audit Log" eyebrow="User Management" />
{#if error}<div class="note bad"><Icon name="alert" size={15} />{error}</div>{/if}
<div class="panel panel-pad">
  <div class="seg" role="tablist" style="margin-bottom:10px">
    <button class:on={tab === 'changes'} onclick={() => (tab = 'changes')}>Access changes · {changes.length}</button>
    <button class:on={tab === 'access'} onclick={() => (tab = 'access')}>Sign-ins & actions · {access.length}</button>
  </div>
  {#if loading}<div class="empty">Loading…</div>
  {:else if tab === 'changes'}<DataTable id="platform-audit" exportName="access-changes" rows={changes} columns={C1} pageSize={20} />
  {:else}
    <DataTable id="platform-access" exportName="sign-ins" rows={access} columns={C2} pageSize={20}>
      {#snippet cell(r)}<Badge status={/^(SUCCESS|2\d\d)$/.test(String(r.result)) ? 'ok' : 'bad'} label={r.result} />{/snippet}
    </DataTable>
  {/if}
</div>
