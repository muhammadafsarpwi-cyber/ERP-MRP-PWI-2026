// @ts-check
// RMR-01-C-B — regression smoke: Receipt Detail actions must keep working
// alongside the new Inventory Status popup (read-only).
const fs = require('fs');
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:3001/api/v1';
const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'system.admin@erp.com';
const PASSWORD = 'Admin#2026!Secure';

const results = [];
function check(name, ok, extra) { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}${extra ? ' :: ' + extra : ''}`); }
function httpJson(method, route, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(API + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, json: j }); }); });
    req.on('error', () => resolve({ status: 0, json: null })); if (data) req.write(data); req.end();
  });
}

(async () => {
  const login = await httpJson('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (!login.json?.token) { console.log('ABORT'); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    localStorage.setItem('erp_theme_prefs_v1', JSON.stringify({ [`user:${user.id}`]: { mode: 'light', paletteId: 'indigo' } }));
  }, { token: login.json.token, user: login.json.user });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/production/receiving', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('tr.ant-table-row', { timeout: 40000 });

  const row = page.locator('tr.ant-table-row', { hasText: 'RMR-00043' }).first();
  await row.locator('.anticon-eye').click();
  await page.waitForSelector('[data-testid="rm-detail-code"]', { timeout: 30000 });
  check('detail opens', (await page.locator('[data-testid="rm-detail-code"]').textContent()).trim() === 'RMR-00043');

  // Edit button present and enabled (not clicked — avoid navigating the form)
  const edit = page.locator('[data-testid="rm-detail-edit"]');
  check('Edit action still present & enabled', (await edit.count()) === 1 && (await edit.isEnabled()));

  // WhatsApp share dialog opens with pre-filled real message (provider-dependent outcome)
  await page.locator('[data-testid="rm-detail-wa"]').click();
  const waModal = page.locator('.ant-modal:has-text("Share Receipt on WhatsApp")');
  await waModal.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  check('WhatsApp share dialog opens', (await waModal.count()) === 1);
  const waHasCode = await waModal.textContent().then((t) => (t || '').includes('RMR-00043'));
  check('WhatsApp message contains real receipt code', waHasCode);
  await waModal.locator('.ant-modal-close').click();
  await page.waitForTimeout(500);
  check('detail STILL open after WhatsApp close (independent stacking)', (await page.locator('[data-testid="rm-detail-code"]').count()) === 1);

  // Stock Ledger Postings section (live ledger entries) or honest warning for zero postings
  const detailBox = page.locator('[data-testid="rmr-detail-body"]');
  const ledger = await detailBox.locator('.rmr-detail-divider:has-text("Stock Ledger Postings")').count();
  check('Stock Ledger Postings section present', ledger === 1);
  const ledgerRows = await detailBox.locator('.rmr-detail-items-table .ant-table-tbody tr').count();
  check('ledger postings rendered (no empty state)', ledgerRows > 0, `rows=${ledgerRows}`);
  const noStock = await detailBox.locator('.ant-alert-warning:has-text("No stock was posted")').count();
  if (ledgerRows === 0) check('honest "no stock posted" warning when zero postings', noStock === 1);

  // close detail cleanly
  const detailClose = page.locator('.ant-modal:has([data-testid="rmr-detail-body"]) .ant-modal-close');
  check('detail close X present', (await detailClose.count()) === 1);
  await detailClose.click();
  await page.waitForTimeout(500);
  check('detail closed after regression', (await page.locator('[data-testid="rm-detail-code"]').count()) === 0);

  check('no page errors during regression', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SMOKE ERROR', e); process.exit(2); });