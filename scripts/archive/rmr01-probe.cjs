// Quick diagnostic: opens the receiving modal, tries header drag with logging,
// and reports the form-data request stream.
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';

async function main() {
  const login = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'system.admin@erp.com', password: 'Admin#2026!Secure' });
    const req = require('http').request(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject); req.write(body); req.end();
  });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', token);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  }, { token: login.token, user: login.user });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => { if (r.url().includes('gate-pass/form-data')) reqs.push('RQ ' + r.method()); });
  page.on('response', async (r) => { if (r.url().includes('gate-pass/form-data')) { const j = await r.json().catch(() => null); reqs.push('RS ' + r.status() + ' keys=' + (j && j.data ? Object.keys(j.data).join(',') : (j ? Object.keys(j).join(',') : '?'))); } });
  await page.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("New Receipt (Gate Pass)")').first().click();
  await page.waitForSelector('text=LIVE VERIFICATION', { timeout: 20000 });
  await page.waitForTimeout(4000);
  console.log('REQUESTS+RESPONSES:', JSON.stringify(reqs));

  const el = page.locator('.erp-draggable-modal');
  const before = await el.evaluate((n) => n.style.transform);
  const hb = await page.locator('.ant-modal-header').first().boundingBox();
  console.log('header bbox', hb);
  await page.evaluate(() => { window.__log = []; window.addEventListener('mousedown', (e) => window.__log.push('md on ' + (e.target.className?.toString?.() || e.target.tagName)), true); window.addEventListener('mousemove', (e) => { if (e.buttons & 1) window.__log.push('mm ' + e.clientX + ',' + e.clientY + ' buttons=' + e.buttons); }); });
  await page.mouse.move(hb.x + 40, hb.y + 18);
  await page.mouse.down();
  await page.mouse.move(hb.x + 40 + 240, hb.y + 18 + 140, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await el.evaluate((n) => n.style.transform);
  console.log('transform before=', before, ' after=', after);
  console.log('EVENTS:', JSON.stringify(await page.evaluate(() => window.__log)));
  await browser.close();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(2); });