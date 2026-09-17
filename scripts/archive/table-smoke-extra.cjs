// Quick smoke for remaining ERPTable consumers (inventory/maintenance/master-data)
const { chromium } = require('playwright');
const http = require('http');
const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
function httpJson(method, route, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(API + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch {} resolve(j); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const ROUTES = [
  ['/inventory/adjustments', 'Stock Adjustments'],
  ['/inventory/transfers', 'Stock Transfers'],
  ['/inventory/ledger', 'Stock Ledger'],
  ['/inventory/reservations', 'Reservations'],
  ['/maintenance/job-cards', 'Job Cards'],
  ['/master-data/items', 'Item'],
  ['/inventory/policies', 'Inventory Policies'],
  ['/inventory/serial-numbers', 'Serial Numbers'],
  ['/store/dashboard', 'Store'],
];
(async () => {
  const login = await httpJson('POST', '/auth/login', { body: { email: 'system.admin@erp.com', password: 'Admin#2026!Secure' } });
  const browser = await chromium.launch({ headless: true });
  let total = 0, failed = 0;
  for (const vp of [{ w: 1280, h: 900, mode: 'light' }, { w: 390, h: 844, mode: 'dark' }]) {
    for (const [route, label] of ROUTES) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const errs = [];
      const pageErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.evaluate(({ token, user, refreshToken, mode }) => {
        localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('erp_user', JSON.stringify(user)); localStorage.setItem('erp_permissions_ts', Date.now().toString());
        localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode, paletteId: 'indigo' } }));
      }, { token: login.token, refreshToken: login.refreshToken, user: login.user, mode: vp.mode });
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4200);
      const state = await page.evaluate(() => ({
        tables: document.querySelectorAll('.ant-table').length,
        sticky: document.querySelectorAll('.ant-table-sticky-holder').length,
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        bodyText: (document.body.innerText || '').slice(0, 120).replace(/\s+/g, ' '),
      }));
      const ok = state.tables > 0 && !pageErrors.length && errs.filter((e) => !e.includes('not connected to any Form element')).length === 0 && state.docOverflow <= 0;
      total++;
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}@${vp.w}/${vp.mode} :: tables=${state.tables} sticky=${state.sticky} docOv=${state.docOverflow} \n   heading="${state.bodyText.slice(0, 90)}" ${pageErrors.length ? 'PAGEERR=' + pageErrors[0].slice(0, 80) : ''} ${errs.length ? 'CONS=' + errs[0].slice(0, 80) : ''}`);
      await page.close();
    }
  }
  console.log(`\n==== SMOKE SUMMARY: ${total} checks, ${failed} failed ====`);
  await browser.close();
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });