// Rule-based alerts — same rules as the production Risk Radar (v84). No predictions.
import { parseTs } from './format.js';
export const DEFAULT_RULES = { minPool: 50, repeatLimit: 3, ageingHours: 24, staleHours: 2 };

export function computeAlerts({ operators, agents, requests, duplicates, lastSync, inventory = [] }, rules = DEFAULT_RULES, now = Date.now()) {
  const out = [];
  const sync = parseTs(lastSync);
  const syncAge = sync ? (now - sync.getTime()) / 3600e3 : null;
  if (syncAge === null) out.push({ kind: 'Data freshness', severity: 'Unknown', subject: 'No confirmed DID inventory sync', detail: 'Sync inventory before interpreting pool risk' });
  else if (syncAge > rules.staleHours) out.push({ kind: 'Data freshness', severity: 'Attention', subject: 'DID inventory is stale', detail: `Last sync ${Math.floor(syncAge)}h ago; verify scheduled job health` });
  if (duplicates > 0) {
    const dups = [...new Set(inventory.filter((i) => i.duplicate).map((i) => i.did))];
    for (const d of dups) {
      const rows = inventory.filter((i) => i.did === d && i.duplicate);
      out.push({ kind: 'Duplicate DID', severity: 'Critical', subject: `DID ${d} on ${rows.length} agents`, detail: rows.map((r) => r.agent).join(' · '), did: d, operator: rows[0]?.operator });
    }
  }
  for (const o of operators) if (o.assigned > 0 && o.available < rules.minPool) out.push({ kind: 'Pool capacity', severity: o.available === 0 ? 'Critical' : 'Attention', subject: `${o.operator} pool low`, detail: `${o.available} available / ${o.assigned} assigned (threshold ${rules.minPool})`, operator: o.operator });
  for (const r of requests) if (r.status === 'needs_reconciliation') out.push({ kind: 'Needs reconciliation', severity: 'Critical', subject: `${r.ticket_no || r.request_id} · ${r.agent_name}`, detail: 'Replacement batch stopped part-way; verify the DID in MCube before retrying', agent_number: r.agent_number, ticket_no: r.ticket_no });
  for (const r of requests) {
    if (!['pending', 'approved', 'processing', 'review_required'].includes(r.status)) continue;
    const t = parseTs(r.first_call_utc); if (!t) continue;
    const age = (now - t.getTime()) / 3600e3;
    if (age >= rules.ageingHours) out.push({ kind: 'Request ageing', severity: age >= rules.ageingHours * 2 ? 'Critical' : 'Attention', subject: `${r.ticket_no} · ${r.agent_name}`, detail: `${Math.floor(age)}h open · ${r.status.replace('_', ' ')}`, agent_number: r.agent_number, ticket_no: r.ticket_no });
  }
  for (const a of agents) if (a.requests >= rules.repeatLimit) out.push({ kind: 'Repeat demand', severity: 'Review', subject: a.agent_name || a.agent_number, detail: `${a.requests} requests · ${a.repeat_requests} repeat`, agent_number: a.agent_number });
  const rank = { Critical: 0, Attention: 1, Unknown: 2, Review: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
