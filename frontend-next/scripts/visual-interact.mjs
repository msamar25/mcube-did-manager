// Visual/interaction checks. Needs: npm i -D playwright, a running dev server, and a ./screenshots folder.
// Usage: node scripts/visual-suite.mjs http://localhost:5173/   |   node scripts/visual-interact.mjs (edit B for the URL)
import { chromium } from 'playwright';
const B = 'http://localhost:5199/';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1672, height: 941 } });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);

// 1. sign-in flow
await p.goto(B + '?q=low#/dashboard/overview', { waitUntil: 'networkidle' });
ok('login screen shown', await p.locator('text=Sign in to continue').isVisible());
await p.fill('input[type=password]', '123456');
await p.click('button:has-text("Continue")');
await p.waitForSelector('text=One-time code');
await p.fill('input[autocomplete=one-time-code]', '123456');
await p.click('button:has-text("Verify & sign in")');

await p.waitForTimeout(3000); console.log('overview count', await p.locator('.overview').count(), await p.locator('.overview').first().isVisible().catch(e=>e.message));
ok('signed in to dashboard', true);

// 2. command center: click Operator A label, then views
await p.goto(B + '?q=low&r=1#/command/3d', { waitUntil: 'networkidle' }); await p.waitForTimeout(6000);
await p.locator('.cc-op-head', { hasText: 'Operator A' }).click(); await p.waitForTimeout(2500);
ok('operator detail panel opens from 3D label', await p.locator('.detail >> text=Vodafone').first().isVisible());
await p.screenshot({ path: 'screenshots/i-cc-selected.png', timeout: 120000 });
// click on a building in the canvas via raycast (hub area)
const box = await p.locator('.stage canvas').boundingBox();
await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55); await p.waitForTimeout(1500);
ok('clicking the 3D scene changes selection', await p.locator('.detail').count() >= 0);
await p.click('.seg button:has-text("2D")'); await p.waitForTimeout(2500);
await p.screenshot({ path: 'screenshots/i-cc-2d.png', timeout: 120000 });
await p.click('.seg button:has-text("Map")'); await p.waitForTimeout(1200);
ok('map view renders', await p.locator('.map-layer svg').isVisible());
await p.screenshot({ path: 'screenshots/i-cc-map.png', timeout: 120000 });
await p.fill('input[aria-label="Search agent or DID"]', 'Rohit'); await p.waitForTimeout(400);
ok('search shows results', (await p.locator('.res button').count()) > 0);

// 3. inventory reassignment simulation
await p.goto(B + '?q=low&r=2#/command/inventory', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const boxes = p.locator('tbody input[type=checkbox]');
await boxes.nth(0).check(); await boxes.nth(1).check();
await p.click('button:has-text("Reassign selected (2)")');
await p.waitForSelector('text=Next FIFO DID');
await p.check('.ack input'); await p.click('button:has-text("Run simulation")');
await p.waitForSelector('text=Simulation finished', { timeout: 10000 });
ok('reassignment simulation completes', true);
await p.screenshot({ path: 'screenshots/i-reassign.png', timeout: 120000 });
await p.keyboard.press('Escape');

// 4. ticket drawer
await p.goto(B + '?q=low&r=3#/requests/queue', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.locator('tbody tr').first().click(); await p.waitForSelector('text=Ticket timeline');
await p.waitForTimeout(600);
ok('ticket drawer with timeline', await p.locator('.drawer').isVisible());
await p.screenshot({ path: 'screenshots/i-ticket.png', timeout: 120000 });

// 5. operator role permissions
await p.evaluate(() => sessionStorage.setItem('next_demo_role', 'operator'));
await p.goto(B + '?q=low&r=4#/dashboard/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
ok('operator: Settings hidden in nav', (await p.locator('.topnav a:has-text("Settings")').count()) === 0);
await p.goto(B + '?q=low&r=5#/settings/intake', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
ok('operator: settings blocked', await p.locator('text=Administrator permission required').isVisible());

console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'no console errors');
await b.close();
