// Visual/interaction checks. Needs: npm i -D playwright, a running dev server, and a ./screenshots folder.
// Usage: node scripts/visual-suite.mjs http://localhost:5173/   |   node scripts/visual-interact.mjs (edit B for the URL)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5199/';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const ROUTES = ['dashboard/overview', 'command/3d', 'command/inventory', 'command/operators', 'command/pool', 'command/agent', 'command/replacement', 'command/risk',
  'requests/queue', 'requests/public-form', 'requests/notifications', 'analytics/insights', 'analytics/teams', 'reports/audit', 'reports/history', 'reports/exports',
  'settings/intake', 'settings/notifications', 'settings/credentials', 'settings/advanced'];
const SIZES = { desktop: [1672, 941], tablet: [820, 1180], mobile: [390, 844] };
const sizes = (process.env.SIZES || 'desktop,tablet,mobile').split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
for (const sz of sizes) {
  const [w, h] = SIZES[sz];
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => sessionStorage.setItem('next_demo_role', 'admin'));
  for (const r of ROUTES) {
    if (only && !only.includes(r)) continue;
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const is3d = r === 'command/3d' || r === 'dashboard/overview';
    await p.goto(`${base}?q=${sz === 'desktop' ? 'high' : 'low'}#/${r}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(is3d ? 8000 : 2200);
    const name = `screenshots/${sz}-${r.replace('/', '_')}.png`;
    await p.screenshot({ path: name, fullPage: sz !== 'desktop', timeout: 120000 });
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
    report.push(`${sz.padEnd(7)} ${r.padEnd(24)} scroll ${m.sw}x${m.sh}${m.sw > w ? ' H-OVERFLOW' : ''} ${errs.length ? 'ERR ' + errs.slice(0, 2).join(' | ') : ''}`);
    await p.close();
  }
  await ctx.close();
}
console.log(report.join('\n'));
await b.close();
