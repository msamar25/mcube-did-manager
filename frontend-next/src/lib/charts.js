// Chart-ready data for the log-derived charts, shared by Dashboard, Command Center, Operators and Pool.
const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// Pool Activity · 24h: verified replacements per hour (exact, from Change_Logs).
export function poolChart(pa) {
  return {
    labels: pa.items.map((b) => hourLabel(b.hour)),
    series: [{ name: 'Assigned from pool', color: '#f26b1d', values: pa.items.map((b) => b.assigned) }],
    poolNow: pa.items.at(-1)?.poolLevel ?? 0,
    pool24hAgo: pa.items[0] ? pa.items[0].poolLevel + pa.items[0].assigned : 0,
    note: `${pa.assigned24} verified replacement${pa.assigned24 === 1 ? '' : 's'} in 24h · from Change_Logs${pa.coverage.complete ? '' : ' · last 500 log rows only'}`
  };
}

// Utilization trend · 7 days: per-operator utilization reconstructed from replacements.
export function trendChart(ops, tr) {
  const series = ops.map((o) => ({ name: o.key, color: o.color, values: tr.items.map((d) => d[o.key] ?? 0) }));
  const all = series.flatMap((s) => s.values);
  const lo = all.length ? Math.min(...all) : 0;
  return {
    labels: tr.items.map((d) => dayLabel(d.date)),
    series,
    yMin: Math.max(0, Math.floor((lo - 5) / 10) * 10),
    yMax: 100,
    note: `Estimated from verified replacements in Change_Logs; MCube pool top-ups are not logged${tr.coverage.complete ? '' : ' · last 500 log rows only'}`
  };
}
