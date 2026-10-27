// Run: node tests/calc.test.mjs   (no dependencies)
import assert from 'node:assert/strict';
import { parseTs, totals, operatorStats, poolActivity24h, utilizationTrend7d, isCommonPool } from '../src/lib/calc.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('timestamps: IST offset honoured; no offset read as UTC (same as production UI)', () => {
  assert.equal(parseTs('2026-10-26T10:00:00+05:30'), Date.parse('2026-10-26T04:30:00Z'));
  assert.equal(parseTs('2026-10-26T10:00:00'), Date.parse('2026-10-26T10:00:00Z'));
  assert.equal(parseTs('2026-10-26 10:00:00'), Date.parse('2026-10-26T10:00:00Z'));
  assert.equal(parseTs('2026-10-26T04:30:00Z'), Date.parse('2026-10-26T04:30:00Z'));
  assert.ok(Number.isNaN(parseTs('')));
});

const inv = [
  { did: '1', status: 'active', agent: 'A', agent_number: '9000000001', operator: 'Tata-57' },
  { did: '2', status: 'active', agent: 'B', agent_number: '9000000002', operator: 'Tata-57' },
  { did: '2', status: 'active', agent: 'C', agent_number: '9000000003', operator: 'Tata-57', duplicate: true },
  { did: '3', status: 'active', agent: 'Common Pool', agent_number: '', operator: 'Tata-57' },
  { did: '4', status: 'pool', operator: 'Tata-57' },
  { did: '5', status: 'inactive', operator: 'Tata-57' },
  { did: '6', status: 'active', agent: 'D', agent_number: '9000000004', operator: 'NewCarrier' },
  { did: '7', status: 'pool', operator: 'NewCarrier' },
  { did: '8', status: 'pool', operator: 'NewCarrier' }
];
inv[1].duplicate = true;

t('totals: unique DIDs, Common Pool excluded from assigned', () => {
  const x = totals(inv);
  assert.equal(x.assigned, 3);      // DIDs 1, 2, 6 (2 counted once)
  assert.equal(x.common, 1);        // DID 3
  assert.equal(x.pool, 3);
  assert.equal(x.inactive, 1);
  assert.equal(x.total, 8);
  assert.equal(x.duplicates, 1);
  assert.equal(x.utilization, 50);  // 3 / (3 + 3)
  assert.ok(isCommonPool(inv[3]));
});

t('operators come from the data (unknown names kept)', () => {
  const o = operatorStats(inv);
  assert.deepEqual(o.map((r) => r.key), ['Tata-57', 'NewCarrier']);
  assert.equal(o[0].utilization, 66.7); // 2 / (2 + 1)
  assert.equal(o[1].utilization, 33.3); // 1 / (1 + 2)
  assert.ok(o[1].color.startsWith('#'));
});

const now = Date.parse('2026-10-26T12:30:00+05:30');
const logs = [
  { time_utc: '2026-10-26T11:10:00+05:30', event: 'REASSIGNMENT_COMPLETE', result: 'SUCCESS', old_did: '5', new_did: '1' },
  { time_utc: '2026-10-26T11:20:00+05:30', event: 'REASSIGNMENT_COMPLETE', result: 'FAILED', old_did: '5', new_did: '2' },
  { time_utc: '2026-10-26T09:00:00+05:30', event: 'BATCH_COMPLETE', result: 'SUCCESS' },
  { time_utc: '2026-10-24T15:00:00+05:30', event: 'REASSIGNMENT_COMPLETE', result: 'SUCCESS', old_did: 'x', new_did: '6' }
];

t('pool activity: exact assignments, pool level walked back', () => {
  const r = poolActivity24h(logs, inv, now);
  assert.equal(r.items.length, 24);
  assert.equal(r.assigned24, 1);                       // failed + non-replacement rows ignored
  const hit = r.items.findIndex((b) => b.assigned === 1);
  assert.equal(r.items[23].poolLevel, 3);              // current pool
  assert.equal(r.items[hit - 1].poolLevel, 4);         // before the assignment there was one more
  assert.equal(r.coverage.complete, true);
});

t('utilization trend: undo replacements day by day (IST days)', () => {
  const r = utilizationTrend7d(logs, inv, now);
  assert.equal(r.items.length, 7);
  const today = r.items[6], yday = r.items[5], d2 = r.items[4], d3 = r.items[3];
  assert.equal(today.date, '2026-10-26');
  assert.equal(today['Tata-57'], 66.7);
  // before today's replacement: new_did 1 back to pool (Tata 1/(1+2)), old_did 5 back to assigned (Tata 2/(2+2))
  assert.equal(yday['Tata-57'], 50);
  // end of 24 Oct already includes that day's replacement into DID 6; end of 23 Oct does not
  assert.equal(d2['NewCarrier'], 33.3); assert.equal(d2.date, '2026-10-24');
  assert.equal(d3['NewCarrier'], 0);
  assert.equal(today.replacements, 1);
});

t('500-row cap marks the window as partial', () => {
  const many = Array.from({ length: 500 }, () => ({ time_utc: '2026-10-26T12:00:00+05:30', event: 'X' }));
  assert.equal(poolActivity24h(many, inv, now).coverage.complete, false);
});
console.log(`\n${n} tests passed`);
import { assignedSince, poolRunway } from '../src/lib/calc.js';
t('assignedSince keeps the latest verified replacement per DID', () => {
  const m = assignedSince([...logs, { time_utc: '2026-10-20T10:00:00+05:30', event: 'REASSIGNMENT_COMPLETE', result: 'SUCCESS', new_did: '1' }]);
  assert.equal(m.get('1'), Date.parse('2026-10-26T11:10:00+05:30'));
  assert.equal(m.get('2'), undefined); // failed replacement ignored
});
t('pool runway from 7-day average', () => {
  const r = poolRunway(70, { items: Array.from({ length: 7 }, () => ({ replacements: 2 })) });
  assert.deepEqual(r, { perDay: 2, days: 35 });
  assert.equal(poolRunway(10, { items: [{ replacements: 0 }] }).days, null);
});
console.log('all tests passed');
