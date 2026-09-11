const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const CHROME = ['C:\\Users\\afsar\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', t.slice(0, 300)); });
  p.on('pageerror', (e) => console.log('PAGE-ERR:', e.message.slice(0, 400)));
  p.on('response', (r) => { const u = r.url(); if (u.includes('3001') && !u.includes('auth/')) console.log('API:', r.status(), u.replace(/^https?:\/\/[^/]+\/api\/v1/, '')); });
  const lr = await fetch('http://localhost:3001/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev@erp-local.test', password: 'Dev#2026Test' }) });
  const j = await lr.json();
  await p.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(({ token, refreshToken, user }) => { localStorage.setItem('token', token); localStorage.setItem('refresh_token', refreshToken); localStorage.setItem('erp_user', JSON.stringify(user)); }, j);
  await p.goto(BASE + '/master-data/items', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length > 0, { timeout: 40000 });
  await p.waitForTimeout(1500);
  const search = p.locator('input[placeholder*="Search by code"]').first();
  await search.fill('FLAT-WIRE-001', { force: true });
  await p.waitForTimeout(1500);
  await p.locator('.ant-table-tbody > tr.ant-table-row').first().locator('button[aria-label^="View"]').first().click({ force: true });
  await p.waitForTimeout(4000);
  const modalCount = await p.locator('.ant-modal-wrap').count();
  console.log('FINAL MODAL COUNT:', modalCount);
  await p.screenshot({ path: 'D:/ERP-MRP-PWI-2026/browser-qa-screenshots/p34-debug4.png' });
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
