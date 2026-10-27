// Shared date range for every trend (Dashboard, Command Center, Operators, Pool, Insights).
// The choice is remembered per browser. Trends over 7+ days read every Change_Logs row of the
// range (/api/logs?days=N), cached for 10 minutes, instead of only the latest 500 rows.
import * as calc from './calc.js';
import { db } from './store.svelte.js';
import { getLogsSince } from './data/source.js';

export const PRESETS = [['24h', '24 h'], ['7d', '7 days'], ['15d', '15 days'], ['30d', '30 days'], ['custom', 'Custom']];
const KEY = 'next_trend_range';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } })();
export const range = $state({ preset: saved?.preset || '7d', from: saved?.from || '', to: saved?.to || '' });
export function saveRange() { try { localStorage.setItem(KEY, JSON.stringify(range)); } catch { /* private mode */ } }

const BUCKETS = [7, 15, 30, 60, 90, 120];
export const rlogs = $state({ items: null, full: false, days: 0, at: 0, loading: false, error: '' });
export const bounds = () => calc.rangeBounds(range);

// Make sure logs covering the current range are loaded (call from a page $effect).
export async function ensureRangeLogs() {
  const need = calc.daysNeeded(bounds());
  if (need <= 2) return; // 24 h: the regular logs are enough
  const days = BUCKETS.find((d) => d >= need) || 120;
  if (rlogs.loading || (rlogs.items && rlogs.days >= days && Date.now() - rlogs.at < 600e3)) return;
  rlogs.loading = true; rlogs.error = '';
  try { const r = await getLogsSince(days); Object.assign(rlogs, { items: r.items, full: r.full, days, at: Date.now() }); }
  catch (e) { rlogs.error = e.message; } finally { rlogs.loading = false; }
}
export function rangeLogs() {
  const need = calc.daysNeeded(bounds());
  return rlogs.items && rlogs.days >= need ? { logs: rlogs.items, full: rlogs.full } : { logs: db.logs, full: false };
}
export function rangeTrend() { const b = bounds(), { logs, full } = rangeLogs(); return calc.utilizationTrend(logs, db.inventory, b.hourly ? calc.rangeBounds({ preset: '7d' }) : b, full); }
export function rangePool() { const b = bounds(), { logs, full } = rangeLogs(); return calc.poolActivity(logs, db.inventory, b, full); }
