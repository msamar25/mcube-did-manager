// Chart-ready data for the log-derived charts, shared by Dashboard, Command Center, Operators and Pool.
const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const partial = (c) => (c.complete ? '' : ' · older rows not loaded');

// Pool activity: verified replacements per hour (24 h) or per day (exact, from Change_Logs).
export function poolChart(pa) {
  return {
    labels: pa.items.map((b) => (pa.hourly === false ? dayLabel(b.date) : hourLabel(b.hour))),
    series: [{ name: 'Assigned from pool', color: '#f26b1d', values: pa.items.map((b) => b.assigned) }],
    poolNow: pa.items.at(-1)?.poolLevel ?? 0,
    pool24hAgo: pa.items[0] ? pa.items[0].poolLevel + pa.items[0].assigned : 0,
    note: `${pa.assigned} replacement${pa.assigned === 1 ? '' : 's'} · ${pa.label || 'last 24 hours'}${partial(pa.coverage)}`
  };
}

// Utilization trend: per-operator utilization per day, estimated from verified replacements.
export function trendChart(ops, tr) {
  const series = ops.map((o) => ({ name: o.key, color: o.color, values: tr.items.map((d) => d[o.key] ?? 0) }));
  const all = series.flatMap((s) => s.values);
  const lo = all.length ? Math.min(...all) : 0;
  return {
    labels: tr.items.map((d) => dayLabel(d.date)),
    series,
    yMin: Math.max(0, Math.floor((lo - 5) / 10) * 10),
    yMax: 100,
    note: `Estimated from replacements · ${tr.label || 'last 7 days'}${partial(tr.coverage)}`
  };
}
